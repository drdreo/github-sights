// ── Sync Queue Processor ────────────────────────────────────────────────────────
//
// Job processor for the sync_job queue. Called by the crawler's drain loop.
// Each tick() call claims and processes a single job. For multi-repo full_sync
// jobs, a tick processes a batch of repos within TICK_BUDGET_MS, then yields
// the job back to the queue. The drain loop calls tick() again to continue.
//
// Phases (full_sync):
//   queued → syncing_repos → aggregating → complete

import { Octokit } from "octokit";
import {
    claimJob,
    advanceJob,
    yieldJob,
    completeJob,
    failJob,
    recordJobError,
    cleanupOldJobs,
    type SyncJobRow
} from "../db/queries/sync-jobs.ts";
import { getConfig } from "../config.ts";
import {
    createOctokit,
    refreshRateLimit,
    getRateLimitState,
    type GitHubRepo
} from "./github-client.ts";
import { ingestRepos, ingestCommitsForRepo, ingestPRsForRepo } from "./ingest.ts";
import { aggregateOwner, aggregateRepo } from "./aggregate.ts";
import { getRepoByName, updateOwnerSyncedAt } from "../db/queries/identity.ts";
import { getSyncSince } from "../db/queries/config.ts";
import type { RepositoryMetaRow } from "../db/types.ts";

// ── Config ───────────────────────────────────────────────────────────────────────

/** Max time a single tick can spend processing repos before yielding. */
const TICK_BUDGET_MS = 60_000;

/** Number of repos to process in parallel within each tick. */
const REPO_CONCURRENCY = 5;

// ── Public API ───────────────────────────────────────────────────────────────────

/**
 * Claim and process a single job from the queue.
 * The crawler's drain loop calls this repeatedly until the queue is empty.
 *
 * @returns `true` if a job was processed (more work may remain),
 *          `false` if the queue is empty.
 */
export async function tick(): Promise<boolean> {
    const job = await claimJob();
    if (!job) return false;

    const tickStart = Date.now();
    console.log(
        `[queue] Tick: claimed job #${job.id} for ${job.owner_login} ` +
            `(phase=${job.phase}, type=${job.job_type})`
    );

    try {
        const config = getConfig(job.owner_login);
        if (!config?.token) {
            await failJob(job.id, `No config or token found for ${job.owner_login}`);
            return true; // Job failed but queue may have more
        }

        const octokit = createOctokit(config.token);

        switch (job.job_type) {
            case "full_sync":
                await processFullSync(job, octokit, config.ownerType, tickStart);
                break;
            case "repo_sync":
                await processRepoSync(job, octokit);
                break;
        }
    } catch (err) {
        console.error(`[queue] Job #${job.id} tick failed:`, err);
        await failJob(job.id, String(err));
    }

    return true;
}

/**
 * Periodic cleanup of old completed/failed jobs.
 * Trigger via the crawler's POST /cleanup endpoint or an external scheduler.
 */
export async function cleanup(): Promise<void> {
    const deleted = await cleanupOldJobs(10);
    if (deleted > 0) {
        console.log(`[queue] Cleaned up ${deleted} old sync jobs`);
    }
}

// ── Full Sync Phases ─────────────────────────────────────────────────────────────

/**
 * Drive a full_sync job through its phases. Chains phases within the same
 * tick when budget allows (e.g. fetch_repos → syncing_repos → aggregating).
 */
async function processFullSync(
    job: SyncJobRow,
    octokit: Octokit,
    ownerType: "user" | "org",
    tickStart: number
): Promise<void> {
    let phase = job.phase;

    // Phase 1: Fetch repos
    if (phase === "queued") {
        const nextPhase = await phaseFetchRepos(job, octokit, ownerType);
        if (!nextPhase) return; // 0 repos → already completed
        phase = nextPhase;
        // Fall through to syncing_repos within the same tick
    }

    // Phase 2: Sync repos
    if (phase === "syncing_repos") {
        const nextPhase = await phaseSyncRepos(job, octokit, tickStart);
        if (!nextPhase) return; // Budget exhausted, yielded for next tick
        phase = nextPhase;
        // Fall through to aggregating
    }

    // Phase 3: Aggregate
    if (phase === "aggregating") {
        await phaseAggregate(job);
    }
}

/**
 * Phase 1: Fetch repo list from GitHub, upsert to DB, store IDs in job.
 * Returns the next phase to chain into, or null if the job is already complete.
 */
async function phaseFetchRepos(
    job: SyncJobRow,
    octokit: Octokit,
    ownerType: "user" | "org"
): Promise<string | null> {
    console.log(`[queue] Job #${job.id}: fetching repos for ${job.owner_login}`);
    const budget = await refreshRateLimit(octokit);
    console.log(`[queue] Rate limit: ${budget.remaining}/${budget.limit}`);

    const { repos } = await ingestRepos(octokit, job.owner_login, ownerType);

    const repoIds = repos.map((r) => r.id);
    const repoNames = repos.map((r) => r.name);

    if (repos.length === 0) {
        console.log(`[queue] Job #${job.id}: no repos found, completing`);
        await completeJob(job.id, { synced: 0, repos: [], errors: [] });
        return null;
    }

    console.log(`[queue] Job #${job.id}: found ${repos.length} repos, chaining to syncing_repos`);
    await advanceJob(job.id, {
        phase: "syncing_repos",
        repo_ids: repoIds,
        repo_names: repoNames,
        total_repos: repos.length,
        repos_done: 0
    });

    // Patch the in-memory job so phaseSyncRepos can use it
    job.phase = "syncing_repos";
    job.repo_ids = repoIds;
    job.repo_names = repoNames;
    job.total_repos = repos.length;
    job.repos_done = 0;

    return "syncing_repos";
}

/**
 * Phase 2: Process repos in batches of REPO_CONCURRENCY until tick budget
 * is exhausted. Picks up from repos_done index. All state is in Postgres,
 * so the job survives crawler restarts.
 *
 * Returns "aggregating" when all repos are done (so processFullSync can chain),
 * or null when budget is exhausted (job yielded for the next drain tick).
 */
async function phaseSyncRepos(
    job: SyncJobRow,
    octokit: Octokit,
    tickStart: number
): Promise<string | null> {
    const repoIds: number[] = job.repo_ids;
    const repoNames: string[] = job.repo_names;
    let { repos_done } = job;
    let totalEvents = job.total_events;

    const desiredSince = job.since_date ?? (await getSyncSince(job.owner_login)) ?? undefined;

    while (repos_done < repoIds.length) {
        // Check tick budget — yield if we've been running too long
        if (Date.now() - tickStart > TICK_BUDGET_MS) {
            console.log(
                `[queue] Job #${job.id}: tick budget exhausted after ` +
                    `${repos_done - job.repos_done} repos this tick`
            );
            break;
        }

        const batchSlice: string[] = [];
        for (let i = 0; i < REPO_CONCURRENCY && repos_done + i < repoIds.length; i++) {
            batchSlice.push(repoNames[repos_done + i]);
        }
        const batchRows = await Promise.all(
            batchSlice.map(async (name) => {
                const row = await getRepoByName(job.owner_login, name);
                return { name, row };
            })
        );
        const batch: { name: string; row: RepositoryMetaRow; ghRepo: GitHubRepo }[] = [];
        for (const { name, row } of batchRows) {
            if (!row) {
                await recordJobError(job.id, `${name}: not found in DB`);
                continue;
            }
            batch.push({ name, row, ghRepo: repoRowToGitHubRepo(row, job.owner_login) });
        }

        const batchNames = batch.map((b) => b.name).join(", ");
        console.log(
            `[queue] Job #${job.id}: syncing [${batchNames}] ` +
                `(${repos_done + 1}-${Math.min(repos_done + REPO_CONCURRENCY, repoIds.length)}/${repoIds.length})`
        );

        // Update progress before processing (so UI shows current repos)
        await advanceJob(job.id, { current_repo: batchNames, repos_done });

        // Process batch concurrently
        const results = await Promise.allSettled(
            batch.map(async ({ name, row, ghRepo }) => {
                const [commits, prs] = await Promise.all([
                    ingestCommitsForRepo(octokit, job.owner_login, ghRepo, {
                        since: job.since_date ?? undefined,
                        until: job.until_date ?? undefined,
                        desiredSince
                    }),
                    ingestPRsForRepo(octokit, job.owner_login, ghRepo)
                ]);

                const events = commits.inserted + prs.upserted;

                // Progressive per-repo aggregation
                if (events > 0) {
                    try {
                        await aggregateRepo(job.owner_login, row);
                    } catch (err) {
                        console.warn(
                            `[queue] ${job.owner_login}/${name}: progressive aggregation failed:`,
                            err
                        );
                    }
                }

                return { name, events };
            })
        );

        // Collect results
        for (const result of results) {
            if (result.status === "fulfilled") {
                totalEvents += result.value.events;
            } else {
                const failedName = repoNames[repos_done];
                await recordJobError(job.id, `${failedName}: ${String(result.reason)}`);
                console.warn(
                    `[queue] Failed repo ${job.owner_login}/${failedName}:`,
                    result.reason
                );
            }
        }

        // Advance by the batch size (including skipped repos not in batch)
        repos_done += REPO_CONCURRENCY;
        if (repos_done > repoIds.length) repos_done = repoIds.length;

        const rateBudget = getRateLimitState(octokit);
        const mem = Math.round(Deno.memoryUsage().heapUsed / 1024 / 1024);
        console.log(
            `[queue] Job #${job.id}: batch done ` +
                `(API: ${rateBudget.remaining}/${rateBudget.limit}, heap: ${mem}MB)`
        );
    }

    // Persist progress
    await advanceJob(job.id, {
        repos_done,
        total_events: totalEvents,
        current_repo: repos_done >= repoIds.length ? null : repoNames[repos_done]
    });

    // All repos done → chain to aggregation
    if (repos_done >= repoIds.length) {
        console.log(`[queue] Job #${job.id}: all repos synced, chaining to aggregating`);
        await advanceJob(job.id, { phase: "aggregating" });
        return "aggregating";
    }

    // Budget exhausted, more repos remain — yield for next drain tick.
    // Clear claimed_at so claimJob() picks this up immediately.
    await yieldJob(job.id);
    console.log(`[queue] Job #${job.id}: yielded (${repos_done}/${repoIds.length} repos done)`);
    return null;
}

/**
 * Phase 3: Run full owner-level aggregation.
 * Rebuilds owner_snapshot, contributor_snapshot, daily_activity.
 */
async function phaseAggregate(job: SyncJobRow): Promise<void> {
    console.log(`[queue] Job #${job.id}: running owner aggregation for ${job.owner_login}`);

    const aggregation = await aggregateOwner(job.owner_login);
    await updateOwnerSyncedAt(job.owner_login);

    console.log(
        `[queue] Job #${job.id}: aggregation complete — ` +
            `${aggregation.repoSnapshots} repo snapshots, ` +
            `${aggregation.contributorSnapshots} contributor snapshots`
    );

    await completeJob(job.id, {
        synced: job.total_events,
        repos: job.repo_names,
        errors: job.errors,
        aggregation
    });

    console.log(`[queue] Job #${job.id}: complete`);
}

// ── Repo Sync (single repo, completes in one tick) ───────────────────────────────

async function processRepoSync(job: SyncJobRow, octokit: Octokit): Promise<void> {
    const repoName = job.repo_name!;
    console.log(`[queue] Job #${job.id}: syncing single repo ${job.owner_login}/${repoName}`);

    const repoRow = await getRepoByName(job.owner_login, repoName);
    if (!repoRow) {
        await failJob(
            job.id,
            `Repository ${job.owner_login}/${repoName} not found in database. Run an owner sync first.`
        );
        return;
    }

    const ghRepo = repoRowToGitHubRepo(repoRow, job.owner_login);

    const budget = await refreshRateLimit(octokit);
    console.log(`[queue] Rate limit: ${budget.remaining}/${budget.limit}`);

    let commitCount = 0;
    let prCount = 0;
    const errors: string[] = [];

    try {
        const [commits, prs] = await Promise.all([
            ingestCommitsForRepo(octokit, job.owner_login, ghRepo),
            ingestPRsForRepo(octokit, job.owner_login, ghRepo)
        ]);
        commitCount = commits.inserted;
        prCount = prs.upserted;
    } catch (err) {
        errors.push(String(err));
    }

    // Rebuild repo snapshot
    try {
        await aggregateRepo(job.owner_login, repoRow);
    } catch (err) {
        console.warn(`[queue] Aggregation failed for ${job.owner_login}/${repoName}:`, err);
    }

    await completeJob(job.id, {
        repo: repoName,
        commits: commitCount,
        prs: prCount,
        errors
    });

    console.log(
        `[queue] Job #${job.id}: repo sync complete (${commitCount} commits, ${prCount} PRs)`
    );
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

/** Convert a RepositoryMetaRow to the GitHubRepo shape needed by ingest functions. */
function repoRowToGitHubRepo(row: RepositoryMetaRow, owner: string): GitHubRepo {
    return {
        id: row.id,
        name: row.name,
        full_name: row.full_name,
        description: row.description,
        html_url: row.html_url ?? `https://github.com/${owner}/${row.name}`,
        private: row.is_private,
        fork: row.is_fork,
        language: row.language,
        default_branch: row.default_branch ?? "main",
        stargazers_count: row.stargazers_count,
        forks_count: row.forks_count,
        open_issues_count: row.open_issues_count,
        created_at: row.created_at?.toISOString() ?? new Date().toISOString(),
        updated_at: row.updated_at?.toISOString() ?? new Date().toISOString(),
        pushed_at: row.pushed_at?.toISOString() ?? new Date().toISOString(),
        owner: {
            login: owner,
            avatar_url: "",
            html_url: `https://github.com/${owner}`
        }
    };
}
