// ── Config Queries ───────────────────────────────────────────────────────────────
//
// CRUD operations for the owner_config table.
// Replaces the old in-memory + Postgres config store.

import { query, queryOne, execute } from "../pool.ts";
import type { OwnerConfigRow } from "../types.ts";

/** Get config for a specific owner (case-insensitive). */
export async function getConfig(owner: string): Promise<OwnerConfigRow | null> {
    return queryOne<OwnerConfigRow>(
        "SELECT * FROM owner_config WHERE LOWER(owner) = LOWER($1)",
        [owner]
    );
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
    ownerType: "user" | "org"
): Promise<void> {
    // Ensure owner identity exists
    await execute(
        `INSERT INTO owner (login, type)
         VALUES ($1, $2)
         ON CONFLICT (login) DO UPDATE SET type = $2`,
        [owner, ownerType]
    );

    await execute(
        `INSERT INTO owner_config (owner, token, owner_type, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (owner) DO UPDATE SET
           token = $2, owner_type = $3, updated_at = NOW()`,
        [owner, token, ownerType]
    );
}

/** Delete config for an owner. */
export async function deleteConfig(owner: string): Promise<void> {
    await execute(
        "DELETE FROM owner_config WHERE LOWER(owner) = LOWER($1)",
        [owner]
    );
}
