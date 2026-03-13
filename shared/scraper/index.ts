// ── Sync Service (Queue-Based) ──────────────────────────────────────────────────
//
// Public API for triggering syncs. Jobs are enqueued into the sync_job table
// and processed tick-by-tick by the crawler service (see queue.ts).

import { getOwner } from "../db/queries/identity.ts";
import {
    enqueueJob,
    getActiveJob,
    getLatestJob,
    cancelJob,
    recordJobError,
    type SyncJobRow
} from "../db/queries/sync-jobs.ts";

const STALE_REPO_THRESHOLD_MS = 6 * 60 * 60 * 1000;

/** URL of the crawler service. Set via CRAWLER_URL env var. */
const CRAWLER_URL = Deno.env.get("CRAWLER_URL") || "http://localhost:3002";

/**
 * Wake the crawler service so it starts draining the job queue.
 * Returns true if the crawler was successfully reached, false otherwise.
 */
async function wakeCrawler(): Promise<boolean> {
    try {
        const res = await fetch(`${CRAWLER_URL}/wake`, { method: "POST" });
        if (!res.ok) {
            console.warn(`[sync] Failed to wake crawler: ${res.status}`);
            return false;
        }
        console.log("[sync] Crawler woken");
        return true;
    } catch (err) {
        console.warn("[sync] Could not reach crawler:", err);
        return false;
    }
}

// ── Types ────────────────────────────────────────────────────────────────────────

export interface SyncProgress {
    active: boolean;
    status: string;
    phase: string;
    totalRepos: number;
    syncedRepos: number;
    currentRepo: string | null;
    totalEvents: number;
    elapsedMs: number;
    lastSyncedAt: string | null;
    errors: string[];
    jobId: number | null;
}

export interface EnqueueResult {
    enqueued: boolean;
    jobId: number | null;
    /** True if a job was already running (coalesced). */
    alreadyRunning: boolean;
}

// ── Public API ───────────────────────────────────────────────────────────────────

/**
 * Enqueue a full sync for an owner. If a sync is already active, returns
 * the existing job (coalescing — same behavior as the old inflight Map).
 */
export async function syncOwner(
    owner: string,
    options?: { since?: string; until?: string }
): Promise<EnqueueResult> {
    // Check for existing active job first
    const existing = await getActiveJob(owner);
    if (existing) {
        console.log(`[sync] Coalescing: active job #${existing.id} already exists for ${owner}`);
        return { enqueued: false, jobId: existing.id, alreadyRunning: true };
    }

    const job = await enqueueJob({
        owner_login: owner,
        job_type: "full_sync",
        since_date: options?.since,
        until_date: options?.until
    });

    if (!job) {
        // Race condition: another request enqueued between our check and insert
        const active = await getActiveJob(owner);
        return { enqueued: false, jobId: active?.id ?? null, alreadyRunning: true };
    }

    console.log(`[sync] Enqueued full_sync job #${job.id} for ${owner}`);
    const reached = await wakeCrawler();
    if (!reached) {
        await recordJobError(job.id, "Crawler service is offline — sync will start when it comes back up");
    }
    return { enqueued: true, jobId: job.id, alreadyRunning: false };
}

/**
 * Enqueue a single-repo sync. Coalesces if already active.
 */
export async function syncRepo(owner: string, repoName: string): Promise<EnqueueResult> {
    const job = await enqueueJob({
        owner_login: owner,
        job_type: "repo_sync",
        repo_name: repoName
    });

    if (!job) {
        const active = await getActiveJob(owner);
        return { enqueued: false, jobId: active?.id ?? null, alreadyRunning: true };
    }

    console.log(`[sync] Enqueued repo_sync job #${job.id} for ${owner}/${repoName}`);
    const reached = await wakeCrawler();
    if (!reached) {
        await recordJobError(job.id, "Crawler service is offline — sync will start when it comes back up");
    }
    return { enqueued: true, jobId: job.id, alreadyRunning: false };
}

/**
 * Check if an owner's data is stale and enqueue a sync if needed.
 * Returns true if a sync was triggered.
 */
export async function ensureFresh(
    owner: string,
    staleMs: number = STALE_REPO_THRESHOLD_MS
): Promise<boolean> {
    // Already syncing? Don't enqueue another.
    const active = await getActiveJob(owner);
    if (active) return false;

    const ownerRow = await getOwner(owner);

    if (!ownerRow?.last_synced_at) {
        console.log(`[sync] ${owner} has never been synced, enqueueing`);
        await syncOwner(owner);
        return true;
    }

    const age = Date.now() - ownerRow.last_synced_at.getTime();
    if (age > staleMs) {
        console.log(
            `[sync] ${owner} data is ${Math.round(age / 60000)}min old ` +
                `(threshold: ${Math.round(staleMs / 60000)}min), enqueueing`
        );
        await syncOwner(owner);
        return true;
    }

    return false;
}

/**
 * Get sync progress for an owner. Reads from the sync_job table instead
 * of in-memory state — survives crawler restarts.
 */
export async function getProgress(owner: string): Promise<SyncProgress> {
    const ownerRow = await getOwner(owner);
    const lastSyncedAt = ownerRow?.last_synced_at?.toISOString() ?? null;

    // Check for active job first
    const active = await getActiveJob(owner);
    if (active) {
        return jobToProgress(active, lastSyncedAt);
    }

    // No active job — check most recent completed/failed job
    const latest = await getLatestJob(owner);
    if (latest && latest.status === "complete") {
        return {
            active: false,
            status: "complete",
            phase: "complete",
            totalRepos: latest.total_repos,
            syncedRepos: latest.repos_done,
            currentRepo: null,
            totalEvents: latest.total_events,
            elapsedMs:
                latest.completed_at && latest.started_at
                    ? latest.completed_at.getTime() - latest.started_at.getTime()
                    : 0,
            lastSyncedAt,
            errors: latest.errors ?? [],
            jobId: latest.id
        };
    }

    return {
        active: false,
        status: "idle",
        phase: "idle",
        totalRepos: 0,
        syncedRepos: 0,
        currentRepo: null,
        totalEvents: 0,
        elapsedMs: 0,
        lastSyncedAt,
        errors: [],
        jobId: null
    };
}

/**
 * Check if a sync is currently in progress for an owner.
 */
export async function isSyncing(owner: string): Promise<boolean> {
    const active = await getActiveJob(owner);
    return active !== null;
}

/**
 * Cancel any active sync for an owner.
 */
export async function abortSync(owner: string): Promise<void> {
    const cancelled = await cancelJob(owner);
    if (cancelled) {
        console.log(`[sync] Cancelled active job for ${owner}`);
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

function jobToProgress(job: SyncJobRow, lastSyncedAt: string | null): SyncProgress {
    // Map job phase to a UI-friendly status
    let status: string;
    switch (job.phase) {
        case "queued":
            status = "fetching_repos";
            break;
        case "syncing_repos":
            status = "syncing_repos";
            break;
        case "aggregating":
            status = "aggregating";
            break;
        default:
            status = job.phase;
    }

    return {
        active: true,
        status,
        phase: job.phase,
        totalRepos: job.total_repos,
        syncedRepos: job.repos_done,
        currentRepo: job.current_repo,
        totalEvents: job.total_events,
        elapsedMs: job.started_at ? Date.now() - job.started_at.getTime() : 0,
        lastSyncedAt,
        errors: job.errors ?? [],
        jobId: job.id
    };
}

// ── Re-exports (barrel) ─────────────────────────────────────────────────────────

export {
    createOctokit,
    verifyToken,
    isRepoExcluded,
    LANGUAGE_COLORS,
    guardRateLimit,
    refreshRateLimit,
    getRateLimitState
} from "./github-client.ts";
export type { GitHubRepo, GitHubCommit, GitHubPR, RateLimitState } from "./github-client.ts";
export { ingestRepos, ingestCommitsForRepo, ingestPRsForRepo } from "./ingest.ts";
export type { IngestCommitsResult, IngestPRsResult } from "./ingest.ts";
export { aggregateOwner, aggregateRepo } from "./aggregate.ts";
export type { AggregateResult } from "./aggregate.ts";
export { tick, cleanup } from "./queue.ts";
