// ── Sync State Queries ───────────────────────────────────────────────────────────
//
// Track high-water marks per (owner, repo, resource_type) for gap-aware syncing.

import { query, queryOne, execute } from "../pool.ts";
import type { SyncStateRow } from "../types.ts";

/** Get sync state for a specific repo + resource type. */
export async function getSyncState(
    ownerLogin: string,
    repoId: number,
    resourceType: "commits" | "pulls" | "workflows"
): Promise<SyncStateRow | null> {
    return queryOne<SyncStateRow>(
        `SELECT * FROM sync_state
         WHERE owner_login = $1 AND repo_id = $2 AND resource_type = $3`,
        [ownerLogin, repoId, resourceType]
    );
}

/** Get all sync states for an owner. */
export async function getSyncStatesByOwner(ownerLogin: string): Promise<SyncStateRow[]> {
    return query<SyncStateRow>(
        "SELECT * FROM sync_state WHERE owner_login = $1 ORDER BY repo_id, resource_type",
        [ownerLogin]
    );
}

/** Update the sync high-water mark after a successful sync. */
export async function upsertSyncState(
    ownerLogin: string,
    repoId: number,
    resourceType: "commits" | "pulls" | "workflows",
    lastSyncedAt: string,
    lastCursor?: string | null
): Promise<void> {
    await execute(
        `INSERT INTO sync_state (owner_login, repo_id, resource_type, last_synced_at, last_cursor, error_count)
         VALUES ($1, $2, $3, $4, $5, 0)
         ON CONFLICT (owner_login, repo_id, resource_type) DO UPDATE SET
           last_synced_at = $4,
           last_cursor = COALESCE($5, sync_state.last_cursor),
           error_count = 0,
           last_error = NULL`,
        [ownerLogin, repoId, resourceType, lastSyncedAt, lastCursor ?? null]
    );
}

/**
 * Advance the sync high-water mark forward only.
 * If the existing last_synced_at is already ahead of `lastSyncedAt`,
 * this is a no-op — prevents backfills from regressing the marker.
 */
export async function advanceSyncState(
    ownerLogin: string,
    repoId: number,
    resourceType: "commits" | "pulls" | "workflows",
    lastSyncedAt: string,
    lastCursor?: string | null
): Promise<void> {
    await execute(
        `INSERT INTO sync_state (owner_login, repo_id, resource_type, last_synced_at, last_cursor, error_count)
         VALUES ($1, $2, $3, $4, $5, 0)
         ON CONFLICT (owner_login, repo_id, resource_type) DO UPDATE SET
           last_synced_at = GREATEST(sync_state.last_synced_at, $4),
           last_cursor = COALESCE($5, sync_state.last_cursor),
           error_count = 0,
           last_error = NULL`,
        [ownerLogin, repoId, resourceType, lastSyncedAt, lastCursor ?? null]
    );
}

/** Record a sync error for a resource. Increments error_count. */
export async function recordSyncError(
    ownerLogin: string,
    repoId: number,
    resourceType: "commits" | "pulls" | "workflows",
    error: string
): Promise<void> {
    await execute(
        `INSERT INTO sync_state (owner_login, repo_id, resource_type, last_synced_at, error_count, last_error)
         VALUES ($1, $2, $3, NOW(), 1, $4)
         ON CONFLICT (owner_login, repo_id, resource_type) DO UPDATE SET
           error_count = sync_state.error_count + 1,
           last_error = $4`,
        [ownerLogin, repoId, resourceType, error]
    );
}

/**
 * Find repos that haven't been synced for a given resource type,
 * or where last sync is older than `staleAfter`.
 */
export async function findStaleRepos(
    ownerLogin: string,
    resourceType: "commits" | "pulls" | "workflows",
    staleAfterMs: number = 6 * 60 * 60 * 1000 // default: 6 hours
): Promise<Array<{ repo_id: number; last_synced_at: string | null }>> {
    const staleThreshold = new Date(Date.now() - staleAfterMs).toISOString();

    return query<{ repo_id: number; last_synced_at: string | null }>(
        `SELECT rm.id AS repo_id, ss.last_synced_at
         FROM repository_meta rm
         LEFT JOIN sync_state ss
           ON ss.repo_id = rm.id
           AND ss.owner_login = $1
           AND ss.resource_type = $2
         WHERE rm.owner_login = $1
           AND rm.is_fork = FALSE
           AND (ss.last_synced_at IS NULL OR ss.last_synced_at < $3)
         ORDER BY ss.last_synced_at ASC NULLS FIRST`,
        [ownerLogin, resourceType, staleThreshold]
    );
}
