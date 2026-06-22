// ── Scraper Module Barrel Export ─────────────────────────────────────────────────
//
// Single entry point for all scraper functionality.
// Re-exports from sub-modules so external consumers don't need to know the internal structure.

// Sync service (public API for triggering syncs)
export { syncOwner, syncRepo, ensureFresh, getProgress, isSyncing, abortSync } from "./sync.ts";
export type { SyncProgress, EnqueueResult } from "./sync.ts";

// GitHub API client
export {
    createOctokit,
    verifyToken,
    isRepoExcluded,
    LANGUAGE_COLORS,
    guardRateLimit,
    refreshRateLimit,
    getRateLimitState
} from "./client/index.ts";
export type { GitHubRepo, GitHubCommit, GitHubPR, RateLimitState } from "./client/index.ts";

// Ingestion
export { ingestRepos, ingestCommitsForRepo, ingestPRsForRepo } from "./ingest/index.ts";
export type { IngestCommitsResult, IngestPRsResult } from "./ingest/index.ts";

// On-demand workflow job ingestion (lazy, triggered when workflow data is viewed)
export { ensureWorkflowJobs } from "./jobs-on-demand.ts";

// Aggregation
export { aggregateOwner, aggregateOwnerIncremental, aggregateRepo } from "./aggregate/index.ts";
export type { AggregateResult } from "./aggregate/index.ts";

// Queue processor
export { tick, cleanup } from "./queue.ts";
