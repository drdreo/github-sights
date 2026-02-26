// ── Cache Instances & Public API ─────────────────────────────────────────────
//
// Barrel file that creates singleton cache instances and re-exports everything
// consumers need. Import from "./cache/index.ts" (or just "./cache").

import type { Repository, PullRequest, Contributor, RepoContributorStats } from "../types.ts";
import { DataCache } from "./data-cache.ts";
import { CommitCache } from "./commit-cache.ts";

export { DataCache, type DataCacheResult } from "./data-cache.ts";
export { CommitCache } from "./commit-cache.ts";

// ── Singleton Instances ─────────────────────────────────────────────────────

/** Stale TTL: 24 hours — data older than this triggers background re-fetch */
const STALE_24H = 24 * 60 * 60 * 1000;

export const repoCache = new DataCache<Repository[]>("repos", STALE_24H);
export const prCache = new DataCache<PullRequest[]>("prs", STALE_24H);
export const contributorCache = new DataCache<Contributor[]>("contributors", STALE_24H);
export const contributorStatsCache = new DataCache<RepoContributorStats[]>(
    "contributor-stats",
    STALE_24H
);
export const commitCache = new CommitCache();

/** Clear all caches (memory + database). Called when config changes. */
export async function clearAllCaches(): Promise<void> {
    await Promise.all([
        repoCache.clear(),
        prCache.clear(),
        contributorCache.clear(),
        contributorStatsCache.clear(),
        commitCache.clear()
    ]);

    console.log("[cache] All caches cleared (memory + database)");
}
