// ── Sync Service (Orchestrator) ──────────────────────────────────────────────────
//
// Coordinates the full sync pipeline: ingest → aggregate.
// Features:
//   - Inflight deduplication: concurrent calls for the same owner coalesce
//   - ensureFresh(): checks staleness and triggers sync if needed
//   - Error isolation: per-repo failures don't abort the entire sync

import type { Octokit } from "octokit";
import { createOctokit, refreshRateLimit, getRateLimitState } from "./github-client.ts";
import { ingestOwner, type IngestOwnerResult } from "./ingest.ts";
import { aggregateOwner, type AggregateResult } from "./aggregate.ts";
import { getOwner } from "../db/queries/identity.ts";

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

// ── Inflight Tracking ────────────────────────────────────────────────────────────

const inflight = new Map<string, Promise<SyncResult>>();

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

    const promise = doSync(owner, token, ownerType, options);

    inflight.set(key, promise);
    try {
        return await promise;
    } finally {
        inflight.delete(key);
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
        // Never synced — trigger sync
        console.log(`[sync] ${owner} has never been synced, triggering sync`);
        // Fire and forget — don't block the read request
        syncOwner(owner, token, ownerType).catch((err) => {
            console.error(`[sync] Background sync failed for ${owner}:`, err);
        });
        return true;
    }

    const lastSync = new Date(ownerRow.last_synced_at).getTime();
    const age = Date.now() - lastSync;

    if (age > staleMs) {
        console.log(
            `[sync] ${owner} data is ${Math.round(age / 60000)}min old (threshold: ${Math.round(staleMs / 60000)}min), triggering sync`
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

// ── Internal ─────────────────────────────────────────────────────────────────────

async function doSync(
    owner: string,
    token: string,
    ownerType: "user" | "org",
    options?: SyncOptions
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

    // Step 1: Ingest from GitHub into event tables
    // Per-repo aggregation happens inside ingestOwner() — each repo's snapshot
    // is built immediately after its commits+PRs are ingested.
    const ingestResult = await ingestOwner(octokit, owner, ownerType, {
        since: options?.since,
        until: options?.until,
        skipAggregation: options?.skipAggregation,
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

    // Step 2: Aggregate events into snapshots
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

    return {
        synced: totalSynced,
        repos: repoNames,
        errors: ingestResult.errors,
        aggregation,
        durationMs,
    };
}

// ── Re-exports (barrel) ──────────────────────────────────────────────────────────

export { createOctokit, verifyToken, isRepoExcluded, LANGUAGE_COLORS, guardRateLimit, refreshRateLimit, getRateLimitState } from "./github-client.ts";
export type { GitHubRepo, GitHubCommit, GitHubPR, RateLimitState } from "./github-client.ts";
export { ingestOwner, ingestRepos, ingestCommitsForRepo, ingestPRsForRepo } from "./ingest.ts";
export type { IngestOwnerResult, IngestCommitsResult, IngestPRsResult } from "./ingest.ts";
export { aggregateOwner, aggregateRepo } from "./aggregate.ts";
export type { AggregateResult } from "./aggregate.ts";
