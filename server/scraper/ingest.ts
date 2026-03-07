// ── Ingest Module ───────────────────────────────────────────────────────────────
//
// Takes raw GitHub API data (from github-client) and writes to event tables.
// Gap-aware: checks sync_state to only fetch missing date ranges.
// Extracts contributor profiles from commit/PR authors.
//
// This module owns ALL writes to: commit_event, pr_event, contributor_profile,
// repository_meta, and sync_state.

import type { Octokit } from "octokit";
import {
    fetchRepos,
    fetchCommits,
    fetchPullRequests,
    isRepoExcluded,
    getRateLimitState,
    type GitHubRepo
} from "./github-client.ts";
import {
    upsertOwner,
    upsertRepos,
    upsertContributors,
    type UpsertRepoInput,
    type UpsertContributorInput
} from "../db/queries/identity.ts";
import {
    insertCommits,
    upsertPrs,
    type InsertCommitInput,
    type InsertPrInput
} from "../db/queries/events.ts";
import {
    getSyncState,
    advanceSyncState,
    retreatEarliestSynced,
    getEarliestSynced,
    recordSyncError
} from "../db/queries/sync-state.ts";
import { updateOwnerSyncedAt } from "../db/queries/identity.ts";
import { aggregateRepo } from "./aggregate.ts";
import type { RepositoryMetaRow } from "../db/types.ts";

// ── Types ────────────────────────────────────────────────────────────────────────

export interface IngestReposResult {
    repos: GitHubRepo[];
    repoCount: number;
}

export interface IngestCommitsResult {
    repoName: string;
    repoId: number;
    inserted: number;
    since: string | null;
    until: string;
}

export interface IngestPRsResult {
    repoName: string;
    repoId: number;
    upserted: number;
}

export interface IngestOwnerResult {
    owner: string;
    repoCount: number;
    repos: Array<{
        name: string;
        commits: IngestCommitsResult;
        prs: IngestPRsResult;
    }>;
    errors: string[];
}

// ── Constants ────────────────────────────────────────────────────────────────────

const CONCURRENCY = 2;

// ── Helpers ──────────────────────────────────────────────────────────────────────

function toCommitInput(c: import("./github-client.ts").GitHubCommit, repoId: number): InsertCommitInput {
    return {
        sha: c.sha,
        repo_id: repoId,
        author_login: c.author_login,
        committer_login: c.committer_login,
        message: c.message,
        html_url: c.html_url,
        committed_at: c.committed_at,
        additions: c.additions,
        deletions: c.deletions,
        is_merge: c.is_merge
    };
}

function collectContributors(
    page: import("./github-client.ts").GitHubCommit[],
    seen: Map<string, UpsertContributorInput>
): void {
    for (const c of page) {
        if (c.author_login && !seen.has(c.author_login)) {
            seen.set(c.author_login, {
                login: c.author_login,
                avatar_url: c.author_avatar_url,
                html_url: `https://github.com/${c.author_login}`,
                name: c.author_name !== "Unknown" ? c.author_name : null,
                email: c.author_email || null
            });
        }
    }
}

// ── Repo Ingestion ───────────────────────────────────────────────────────────────

/**
 * Fetch repos from GitHub and upsert into repository_meta.
 * Also upserts the owner record.
 * Returns the list of non-fork, non-excluded repos.
 */
export async function ingestRepos(
    octokit: Octokit,
    owner: string,
    ownerType: "user" | "org"
): Promise<IngestReposResult> {
    // Fetch repos from GitHub (already filters forks + excluded)
    const ghRepos = await fetchRepos(octokit, owner, ownerType);

    // Upsert owner
    await upsertOwner(owner, ownerType);

    // Map to DB shape and upsert
    const repoInputs: UpsertRepoInput[] = ghRepos.map((r) => ({
        id: r.id,
        owner_login: owner,
        name: r.name,
        full_name: r.full_name,
        description: r.description,
        html_url: r.html_url,
        is_private: r.private,
        is_fork: r.fork,
        language: r.language,
        default_branch: r.default_branch,
        stargazers_count: r.stargazers_count,
        forks_count: r.forks_count,
        open_issues_count: r.open_issues_count,
        created_at: r.created_at,
        updated_at: r.updated_at,
        pushed_at: r.pushed_at
    }));

    await upsertRepos(repoInputs);

    // Filter to non-fork repos for downstream ingestion, prioritize recently active repos
    const activeRepos = ghRepos
        .filter((r) => !r.fork && !isRepoExcluded(r.name))
        .sort((a, b) => new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime());
    console.log(
        `[ingest] ${owner}: ${activeRepos.length}/${ghRepos.length} repos eligible (excluded forks + ignored)`
    );

    return { repos: activeRepos, repoCount: ghRepos.length };
}

// ── Commit Ingestion ─────────────────────────────────────────────────────────────

/**
 * Ingest commits for a single repo.
 * Gap-aware: only fetches commits newer than the last sync high-water mark.
 * Extracts contributor profiles from commit authors.
 */
export async function ingestCommitsForRepo(
    octokit: Octokit,
    owner: string,
    repo: GitHubRepo,
    options?: { since?: string; until?: string; desiredSince?: string }
): Promise<IngestCommitsResult> {
    const repoId = repo.id;
    const repoName = repo.name;

    // Determine fetch window using sync_state high-water mark
    let fetchSince = options?.since ?? null;
    const fetchUntil = options?.until ?? new Date().toISOString();

    if (!fetchSince) {
        const syncState = await getSyncState(owner, repoId, "commits");
        if (syncState?.last_synced_at) {
            // Fetch from 1 second after last sync to avoid re-fetching boundary commits
            const lastSync = new Date(syncState.last_synced_at.getTime());
            lastSync.setSeconds(lastSync.getSeconds() + 1);
            fetchSince = lastSync.toISOString();
        }
    }

    // Fetch from GitHub — stream page-by-page to avoid accumulating all commits in memory
    let totalInserted = 0;
    let totalFetched = 0;
    const seenContributors = new Map<string, UpsertContributorInput>();

    await fetchCommits(octokit, owner, repoName, {
        since: fetchSince ?? undefined,
        until: fetchUntil,
        onPage: async (page) => {
            totalFetched += page.length;
            totalInserted += await insertCommits(page.map((c) => toCommitInput(c, repoId)));
            collectContributors(page, seenContributors);
        }
    });

    if (totalFetched === 0) {
        // Only advance high-water mark forward, never backward (protects backfills)
        await advanceSyncState(owner, repoId, "commits", fetchUntil);
    } else {
        console.log(
            `[ingest] ${owner}/${repoName}: fetched ${totalFetched} commits${fetchSince ? ` (since ${fetchSince.split("T")[0]})` : " (full history)"}`
        );

        // Upsert contributor profiles
        await upsertContributors(Array.from(seenContributors.values()));

        // Only advance high-water mark forward, never backward (protects backfills)
        await advanceSyncState(owner, repoId, "commits", fetchUntil);
    }

    // Track what the forward pass covered
    const earliestCovered = fetchSince ?? "1970-01-01T00:00:00Z";
    await retreatEarliestSynced(owner, repoId, "commits", earliestCovered);

    // ── Backward gap detection ───────────────────────────────────────────────
    const desiredSince = options?.desiredSince;
    if (desiredSince) {
        const earliestSynced = await getEarliestSynced(owner, repoId, "commits");

        if (!earliestSynced || new Date(desiredSince) < new Date(earliestSynced)) {
            const backfillUntil = earliestSynced ?? fetchUntil;
            console.log(
                `[ingest] ${owner}/${repoName}: backfilling commits ${desiredSince.split("T")[0]} → ${backfillUntil.split("T")[0]}`
            );

            let backfillFetched = 0;

            await fetchCommits(octokit, owner, repoName, {
                since: desiredSince,
                until: backfillUntil,
                onPage: async (page) => {
                    backfillFetched += page.length;
                    totalInserted += await insertCommits(page.map((c) => toCommitInput(c, repoId)));
                    collectContributors(page, seenContributors);
                }
            });

            if (backfillFetched > 0) {
                console.log(
                    `[ingest] ${owner}/${repoName}: backfill fetched ${backfillFetched} commits`
                );

                await upsertContributors(Array.from(seenContributors.values()));
            }

            await retreatEarliestSynced(owner, repoId, "commits", desiredSince);
        }
    }

    return { repoName, repoId, inserted: totalInserted, since: fetchSince, until: fetchUntil };
}

/**
 * Ingest PRs for a single repo.
 * Fetches all PRs and upserts them (idempotent).
 */
export async function ingestPRsForRepo(
    octokit: Octokit,
    owner: string,
    repo: GitHubRepo
): Promise<IngestPRsResult> {
    const repoId = repo.id;
    const repoName = repo.name;

    // Fetch all PRs — stream page-by-page to avoid accumulating all PRs in memory.
    // PRs are upserted (idempotent), so fetching all is correct.
    let totalUpserted = 0;
    let totalFetched = 0;
    const seenContributors = new Map<string, UpsertContributorInput>();

    await fetchPullRequests(octokit, owner, repoName, "all", {
        onPage: async (page) => {
            totalFetched += page.length;

            const prInputs: InsertPrInput[] = page.map((pr) => ({
                id: pr.id,
                repo_id: repoId,
                number: pr.number,
                author_login: pr.author_login,
                title: pr.title,
                state: pr.state,
                is_draft: pr.is_draft,
                html_url: pr.html_url,
                base_ref: pr.base_ref,
                head_ref: pr.head_ref,
                additions: pr.additions,
                deletions: pr.deletions,
                changed_files: pr.changed_files,
                created_at: pr.created_at,
                closed_at: pr.closed_at,
                merged_at: pr.merged_at
            }));

            totalUpserted += await upsertPrs(prInputs);

            // Deduplicate contributors as we go
            for (const pr of page) {
                if (pr.author_login && !seenContributors.has(pr.author_login)) {
                    seenContributors.set(pr.author_login, {
                        login: pr.author_login,
                        avatar_url: pr.author_avatar_url,
                        html_url: `https://github.com/${pr.author_login}`
                    });
                }
            }
        }
    });

    if (totalFetched === 0) {
        await advanceSyncState(owner, repoId, "pulls", new Date().toISOString());
        return { repoName, repoId, upserted: 0 };
    }

    console.log(`[ingest] ${owner}/${repoName}: fetched ${totalFetched} PRs`);

    // Upsert contributor profiles
    await upsertContributors(Array.from(seenContributors.values()));

    await advanceSyncState(owner, repoId, "pulls", new Date().toISOString());

    return { repoName, repoId, upserted: totalUpserted };
}

// ── Full Owner Ingestion ─────────────────────────────────────────────────────────

/**
 * Ingest all data for an owner: repos → PRs per repo.
 * Processes repos in batches with controlled concurrency.
 * Commits are fetched on-demand per repo via syncRepo().
 */
export async function ingestOwner(
    octokit: Octokit,
    owner: string,
    ownerType: "user" | "org",
    options?: {
        since?: string;
        until?: string;
        desiredSince?: string;
        skipAggregation?: boolean;
        signal?: AbortSignal;
        onProgress?: (update: {
            syncedRepos: number;
            totalRepos: number;
            currentRepo: string;
            totalEvents: number;
        }) => void;
    }
): Promise<IngestOwnerResult> {
    // Step 1: Ingest repos
    const { repos } = await ingestRepos(octokit, owner, ownerType);
    console.log(
        `[ingest] ${owner}: starting ingestion for ${repos.length} repos (concurrency=${CONCURRENCY})`
    );

    const results: IngestOwnerResult["repos"] = [];
    const errors: string[] = [];

    // Step 2: Ingest commits + PRs per repo in batches
    for (let i = 0; i < repos.length; i += CONCURRENCY) {
        if (options?.signal?.aborted) {
            console.log(`[ingest] ${owner}: sync aborted, stopping ingestion`);
            break;
        }
        const batch = repos.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.allSettled(
            batch.map(async (repo) => {
                const [commits, prs] = await Promise.all([
                    ingestCommitsForRepo(octokit, owner, repo, {
                        since: options?.since,
                        until: options?.until,
                        desiredSince: options?.desiredSince
                    }),
                    ingestPRsForRepo(octokit, owner, repo)
                ]);
                return { name: repo.name, repoGh: repo, commits, prs };
            })
        );

        for (let j = 0; j < batchResults.length; j++) {
            const result = batchResults[j];
            const repo = batch[j];
            if (result.status === "fulfilled") {
                results.push({
                    name: result.value.name,
                    commits: result.value.commits,
                    prs: result.value.prs
                });
            } else {
                const errMsg = `${repo.name}: ${String(result.reason)}`;
                errors.push(errMsg);
                console.warn(`[ingest] Failed repo ${owner}/${repo.name}:`, result.reason);
                // Record error in sync_state
                await recordSyncError(owner, repo.id, "commits", String(result.reason));
            }
        }

        const budget = getRateLimitState(octokit);
        console.log(
            `[ingest] ${owner}: batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(repos.length / CONCURRENCY)} complete (API budget: ${budget.remaining}/${budget.limit})`
        );

        // Report progress to caller
        if (options?.onProgress) {
            const totalEvents = results.reduce(
                (sum, r) => sum + r.commits.inserted + r.prs.upserted,
                0
            );
            const lastRepo = batch[batch.length - 1];
            options.onProgress({
                syncedRepos: Math.min(i + CONCURRENCY, repos.length),
                totalRepos: repos.length,
                currentRepo: lastRepo?.name ?? "",
                totalEvents
            });
        }

        // Run progressive per-repo aggregation so snapshots are available immediately
        // Skip repos with no new data — snapshot hasn't changed, no need to reload from DB
        if (!options?.skipAggregation) {
            for (let j = 0; j < batchResults.length; j++) {
                const result = batchResults[j];
                const repo = batch[j];
                if (result.status === "fulfilled") {
                    const { commits, prs } = result.value;
                    if (commits.inserted === 0 && prs.upserted === 0) continue;
                    try {
                        const repoMeta: RepositoryMetaRow = {
                            id: repo.id,
                            owner_login: owner,
                            name: repo.name,
                            full_name: repo.full_name,
                            description: repo.description,
                            html_url: repo.html_url,
                            is_private: repo.private,
                            is_fork: repo.fork,
                            language: repo.language,
                            default_branch: repo.default_branch,
                            stargazers_count: repo.stargazers_count,
                            forks_count: repo.forks_count,
                            open_issues_count: repo.open_issues_count,
                            created_at: repo.created_at ? new Date(repo.created_at) : null,
                            updated_at: repo.updated_at ? new Date(repo.updated_at) : null,
                            pushed_at: repo.pushed_at ? new Date(repo.pushed_at) : null
                        };
                        await aggregateRepo(owner, repoMeta);
                    } catch (err) {
                        console.warn(
                            `[ingest] ${owner}/${repo.name}: progressive aggregation failed (non-fatal):`,
                            err
                        );
                    }
                }
            }
        }
    }
    // Update owner's last_synced_at timestamp
    await updateOwnerSyncedAt(owner);

    return {
        owner,
        repoCount: repos.length,
        repos: results,
        errors
    };
}
