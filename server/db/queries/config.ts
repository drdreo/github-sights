// ── Config Queries ───────────────────────────────────────────────────────────────
//
// CRUD operations for the owner_config table.
// Replaces the old in-memory + Postgres config store.

import { query, queryOne, execute } from "../pool.ts";
import type { OwnerConfigRow } from "../types.ts";

/** Get config for a specific owner (case-insensitive). */
export async function getConfig(owner: string): Promise<OwnerConfigRow | null> {
    return queryOne<OwnerConfigRow>("SELECT * FROM owner_config WHERE LOWER(owner) = LOWER($1)", [
        owner
    ]);
}

/** Get all stored configs. */
export async function getAllConfigs(): Promise<OwnerConfigRow[]> {
    return query<OwnerConfigRow>("SELECT * FROM owner_config ORDER BY owner");
}

/**
 * Insert or update config for an owner.
 * Also ensures the `owner` identity row exists.
 */
export async function upsertConfig(
    owner: string,
    token: string,
    ownerType: "user" | "org",
    syncSince?: string | null
): Promise<void> {
    // Ensure owner identity exists
    await execute(
        `INSERT INTO owner (login, type)
         VALUES ($1, $2)
         ON CONFLICT (login) DO UPDATE SET type = $2`,
        [owner, ownerType]
    );

    await execute(
        `INSERT INTO owner_config (owner, token, owner_type, sync_since, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (owner) DO UPDATE SET
           token = $2, owner_type = $3,
           sync_since = COALESCE($4, owner_config.sync_since),
           updated_at = NOW()`,
        [owner, token, ownerType, syncSince ?? null]
    );
}

/** Update the persisted sync_since date for an owner. */
export async function updateSyncSince(owner: string, syncSince: string): Promise<void> {
    await execute(
        `UPDATE owner_config SET sync_since = $2, updated_at = NOW()
         WHERE LOWER(owner) = LOWER($1)`,
        [owner, syncSince]
    );
}

/** Get the persisted sync_since date for an owner. */
export async function getSyncSince(owner: string): Promise<string | null> {
    const row = await queryOne<{ sync_since: Date | null }>(
        "SELECT sync_since FROM owner_config WHERE LOWER(owner) = LOWER($1)",
        [owner]
    );
    return row?.sync_since?.toISOString() ?? null;
}

/** Delete config for an owner. */
export async function deleteConfig(owner: string): Promise<void> {
    await execute("DELETE FROM owner_config WHERE LOWER(owner) = LOWER($1)", [owner]);
}
