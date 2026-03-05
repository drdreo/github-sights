// ── Sync Service (Orchestrator) ──────────────────────────────────────────────────
//
// Coordinates the full sync pipeline: ingest → aggregate.
// Features:
//   - Inflight deduplication: concurrent calls for the same owner coalesce
//   - ensureFresh(): checks staleness and triggers sync if needed
//   - Error isolation: per-repo failures don't abort the entire sync

import type { Octokit } from "octokit";
import { createOctokit, refreshRateLimit, getRateLimitState, type GitHubRepo } from "./github-client.ts";
import { ingestOwner, ingestCommitsForRepo, ingestPRsForRepo, type IngestOwnerResult } from "./ingest.ts";
import { aggregateOwner, aggregateRepo, type AggregateResult } from "./aggregate.ts";
import { getOwner, getRepoByName } from "../db/queries/identity.ts";
import { getSyncSince } from "../db/queries/config.ts";
import type { RepositoryMetaRow } from "../db/types.ts";
import { initProgress, updateProgress, clearProgress } from "./progress.ts";

// ── Types ────────────────────────────────────────────────────────────────────────

export interface SyncResult {
    synced: number;
    repos: string[];
    errors: string[];
    aggregation: AggregateResult;
    durationMs: number;
}

export interface SyncOptions {
    since?: string;
    until?: string;
    /** Skip aggregation (useful for partial syncs). Defaults to false. */
    skipAggregation?: boolean;
}

export interface SyncRepoResult {
    repo: string;
    commits: number;
    prs: number;
    errors: string[];
    durationMs: number;
}

// ── Inflight Tracking ────────────────────────────────────────────────────────────

const inflight = new Map<string, Promise<SyncResult>>();
const inflightAbort = new Map<string, AbortController>();
const inflightRepo = new Map<string, Promise<SyncRepoResult>>();

// ── Staleness Config ─────────────────────────────────────────────────────────────

/** Default staleness threshold: 6 hours */
const DEFAULT_STALE_MS = 6 * 60 * 60 * 1000;

// ── Public API ───────────────────────────────────────────────────────────────────

/**
 * Sync all data for an owner: ingest from GitHub → rebuild snapshots.
 *
 * Concurrent calls for the same owner coalesce into a single sync operation.
 * Returns the same promise for all callers.
 */
export async function syncOwner(
    owner: string,
    token: string,
    ownerType: "user" | "org",
    options?: SyncOptions
): Promise<SyncResult> {
    const key = owner.toLowerCase();

    // Coalesce concurrent requests for the same owner
    const existing = inflight.get(key);
    if (existing) {
        console.log(`[sync] Coalescing duplicate sync for ${owner}`);
        return existing;
    }

    const ac = new AbortController();
    const promise = doSync(owner, token, ownerType, options, ac.signal);

    inflight.set(key, promise);
    inflightAbort.set(key, ac);
    try {
        return await promise;
    } finally {
        inflight.delete(key);
        inflightAbort.delete(key);
    }
}

/**
 * Check if an owner's data is stale and trigger sync if needed.
 * Returns true if a sync was triggered, false if data is fresh.
 *
 * Use this in read endpoints to ensure data freshness on-demand.
 */
export async function ensureFresh(
    owner: string,
    token: string,
    ownerType: "user" | "org",
    staleMs: number = DEFAULT_STALE_MS
): Promise<boolean> {
    const ownerRow = await getOwner(owner);

    if (!ownerRow?.last_synced_at) {
        // Never synced — trigger background sync
        console.log(`[sync] ${owner} has never been synced, triggering background sync`);
        // Fire and forget — don't block the read request
        syncOwner(owner, token, ownerType).catch((err) => {
            console.error(`[sync] Background sync failed for ${owner}:`, err);
        });
        return true;
    }

    const lastSync = ownerRow.last_synced_at.getTime();
    const age = Date.now() - lastSync;

    if (age > staleMs) {
        console.log(
            `[sync] ${owner} data is ${Math.round(age / 60000)}min old (threshold: ${Math.round(staleMs / 60000)}min), triggering background sync`
        );
        syncOwner(owner, token, ownerType).catch((err) => {
            console.error(`[sync] Background sync failed for ${owner}:`, err);
        });
        return true;
    }

    return false;
}

/**
 * Check if a sync is currently in progress for an owner.
 */
export function isSyncing(owner: string): boolean {
    return inflight.has(owner.toLowerCase());
}

/**
 * Abort any in-flight sync for this owner and wait for it to finish.
 * Resolves immediately if no sync is running.
 */
export async function abortInflight(owner: string): Promise<void> {
    const key = owner.toLowerCase();
    const ac = inflightAbort.get(key);
    if (ac) {
        console.log(`[sync] Aborting in-flight sync for ${owner}`);
        ac.abort();
    }
    const existing = inflight.get(key);
    if (existing) {
        await existing.catch(() => {});
    }
}

// ── Internal ─────────────────────────────────────────────────────────────────────

async function doSync(
    owner: string,
    token: string,
    ownerType: "user" | "org",
    options?: SyncOptions,
    signal?: AbortSignal
): Promise<SyncResult> {
    const start = Date.now();
    const isBackfill = !!(options?.since || options?.until);
    console.log(`[sync] Starting ${isBackfill ? 'BACKFILL' : 'sync'} for ${ownerType}:${owner}${isBackfill ? ` (range: ${options?.since ?? 'beginning'} → ${options?.until ?? 'now'})` : ''}`);
    if (isBackfill) {
        console.warn(`[sync] ⚠ Manual backfill: only the specified range will be fetched. Gaps outside this range will NOT be auto-filled.`);
    }

    const octokit = createOctokit(token);

    // Log initial rate limit budget
    const initialBudget = await refreshRateLimit(octokit);
    console.log(`[sync] Rate limit budget: ${initialBudget.remaining}/${initialBudget.limit} remaining (resets ${initialBudget.resetAt.toISOString()})`);

    // Initialize progress tracking
    initProgress(owner);

    // Resolve desiredSince: explicit option first, then persisted sync_since from DB
    const desiredSince = options?.since ?? (await getSyncSince(owner)) ?? undefined;

    // Step 1: Ingest from GitHub into event tables
    // Per-repo aggregation happens inside ingestOwner() — each repo's snapshot
    // is built immediately after its commits+PRs are ingested.
    const ingestResult = await ingestOwner(octokit, owner, ownerType, {
        since: options?.since,
        until: options?.until,
        desiredSince,
        skipAggregation: options?.skipAggregation,
        signal,
        onProgress: (update) => {
            updateProgress(owner, {
                status: "syncing_repos",
                syncedRepos: update.syncedRepos,
                totalRepos: update.totalRepos,
                currentRepo: update.currentRepo,
                totalEvents: update.totalEvents,
            });
        },
    });

    const totalSynced = ingestResult.repos.reduce(
        (sum, r) => sum + r.commits.inserted + r.prs.upserted,
        0
    );
    const repoNames = ingestResult.repos.map((r) => r.name);

    console.log(
        `[sync] Ingested ${totalSynced} events across ${ingestResult.repoCount} repos for ${owner} ` +
        `(${ingestResult.errors.length} errors)`
    );

    // Log rate limit budget after ingestion
    const postIngestBudget = getRateLimitState(octokit);
    console.log(`[sync] Rate limit budget after ingestion: ${postIngestBudget.remaining}/${postIngestBudget.limit} remaining`);

    // Bail out if aborted (e.g. owner deletion in progress)
    if (signal?.aborted) {
        console.log(`[sync] Sync aborted for ${owner}, skipping aggregation`);
        clearProgress(owner);
        return { synced: 0, repos: repoNames, errors: ["Sync aborted"], aggregation: { owner, dailyActivityRows: 0, repoSnapshots: 0, contributorSnapshots: 0, ownerSnapshotUpdated: false }, durationMs: Date.now() - start };
    }

    // Step 2: Aggregate events into snapshots
    updateProgress(owner, { status: "aggregating" });
    let aggregation: AggregateResult;

    if (options?.skipAggregation) {
        aggregation = {
            owner,
            dailyActivityRows: 0,
            repoSnapshots: 0,
            contributorSnapshots: 0,
            ownerSnapshotUpdated: false,
        };
    } else {
        aggregation = await aggregateOwner(owner);
        console.log(
            `[sync] Aggregated for ${owner}: ` +
            `${aggregation.repoSnapshots} repo snapshots, ` +
            `${aggregation.contributorSnapshots} contributor snapshots, ` +
            `${aggregation.dailyActivityRows} daily activity rows`
        );
    }

    const durationMs = Date.now() - start;
    console.log(`[sync] Completed sync for ${owner} in ${durationMs}ms`);

    // Mark complete and clear after 30s
    updateProgress(owner, { status: "complete" });
    setTimeout(() => clearProgress(owner), 30_000);

    return {
        synced: totalSynced,
        repos: repoNames,
        errors: ingestResult.errors,
        aggregation,
        durationMs,
    };
}

// ── Single-Repo Deep Sync ────────────────────────────────────────────────────────

/**
 * Deep-sync a single repo: fetch commits + PRs, then rebuild its snapshot.
 * Used when a user navigates to a repo detail page.
 * Concurrent calls for the same repo coalesce.
 */
export async function syncRepo(
    owner: string,
    repoName: string,
    token: string,
    ownerType: "user" | "org"
): Promise<SyncRepoResult> {
    const key = `${owner}/${repoName}`.toLowerCase();

    const existing = inflightRepo.get(key);
    if (existing) {
        console.log(`[sync] Coalescing duplicate repo sync for ${key}`);
        return existing;
    }

    const promise = doSyncRepo(owner, repoName, token, ownerType);
    inflightRepo.set(key, promise);
    try {
        return await promise;
    } finally {
        inflightRepo.delete(key);
    }
}

async function doSyncRepo(
    owner: string,
    repoName: string,
    token: string,
    ownerType: "user" | "org"
): Promise<SyncRepoResult> {
    const start = Date.now();
    console.log(`[sync] Starting deep sync for ${owner}/${repoName}`);

    const octokit = createOctokit(token);
    const initialBudget = await refreshRateLimit(octokit);
    console.log(`[sync] Rate limit budget: ${initialBudget.remaining}/${initialBudget.limit} remaining`);

    // Look up the repo in DB to get its GitHub ID
    const repoRow = await getRepoByName(owner, repoName);
    if (!repoRow) {
        throw new Error(`Repository ${owner}/${repoName} not found in database. Run an owner sync first.`);
    }

    // Build the GitHubRepo shape needed by ingest functions
    const ghRepo: GitHubRepo = {
        id: repoRow.id,
        name: repoRow.name,
        full_name: repoRow.full_name,
        description: repoRow.description,
        html_url: repoRow.html_url ?? `https://github.com/${owner}/${repoName}`,
        private: repoRow.is_private,
        fork: repoRow.is_fork,
        language: repoRow.language,
        default_branch: repoRow.default_branch ?? "main",
        stargazers_count: repoRow.stargazers_count,
        forks_count: repoRow.forks_count,
        open_issues_count: repoRow.open_issues_count,
        created_at: repoRow.created_at?.toISOString() ?? new Date().toISOString(),
        updated_at: repoRow.updated_at?.toISOString() ?? new Date().toISOString(),
        pushed_at: repoRow.pushed_at?.toISOString() ?? new Date().toISOString(),
        owner: {
            login: owner,
            avatar_url: "",
            html_url: `https://github.com/${owner}`,
        },
    };

    const errors: string[] = [];
    let commitCount = 0;
    let prCount = 0;

    try {
        const [commits, prs] = await Promise.all([
            ingestCommitsForRepo(octokit, owner, ghRepo),
            ingestPRsForRepo(octokit, owner, ghRepo),
        ]);
        commitCount = commits.inserted;
        prCount = prs.upserted;
    } catch (err) {
        errors.push(String(err));
        console.warn(`[sync] Failed repo sync for ${owner}/${repoName}:`, err);
    }

    // Rebuild repo snapshot
    try {
        const repoMeta: RepositoryMetaRow = {
            id: repoRow.id,
            owner_login: owner,
            name: repoRow.name,
            full_name: repoRow.full_name,
            description: repoRow.description,
            html_url: repoRow.html_url,
            is_private: repoRow.is_private,
            is_fork: repoRow.is_fork,
            language: repoRow.language,
            default_branch: repoRow.default_branch,
            stargazers_count: repoRow.stargazers_count,
            forks_count: repoRow.forks_count,
            open_issues_count: repoRow.open_issues_count,
            created_at: repoRow.created_at,
            updated_at: repoRow.updated_at,
            pushed_at: repoRow.pushed_at,
        };
        await aggregateRepo(owner, repoMeta);
    } catch (err) {
        console.warn(`[sync] Aggregation failed for ${owner}/${repoName} (non-fatal):`, err);
    }

    const durationMs = Date.now() - start;
    console.log(`[sync] Completed repo sync for ${owner}/${repoName} in ${durationMs}ms (${commitCount} commits, ${prCount} PRs)`);

    return { repo: repoName, commits: commitCount, prs: prCount, errors, durationMs };
}

// ── Re-exports (barrel) ────────────────────────────────────────────────────────────

export { createOctokit, verifyToken, isRepoExcluded, LANGUAGE_COLORS, guardRateLimit, refreshRateLimit, getRateLimitState } from "./github-client.ts";
export type { GitHubRepo, GitHubCommit, GitHubPR, RateLimitState } from "./github-client.ts";
export { ingestOwner, ingestRepos, ingestCommitsForRepo, ingestPRsForRepo } from "./ingest.ts";
export type { IngestOwnerResult, IngestCommitsResult, IngestPRsResult } from "./ingest.ts";
export { aggregateOwner, aggregateRepo } from "./aggregate.ts";
export type { AggregateResult } from "./aggregate.ts";
export { getProgress } from "./progress.ts";
export type { SyncProgress } from "./progress.ts";
