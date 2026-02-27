// ── Config Store (in-memory + Postgres) ─────────────────────────────────────────
//
// Manages owner configurations backed by the new owner_config table.
// Maintains an in-memory Map for fast lookups, backed by Postgres for persistence.
// Replaces the old config.ts that depended on GitHubService and the old db.ts.

import type { ApiConfig } from "./types.ts";
import {
    getConfig as dbGetConfig,
    getAllConfigs,
    upsertConfig as dbUpsertConfig,
    deleteConfig as dbDeleteConfig,
} from "./db/queries/config.ts";
import { isPoolAvailable } from "./db/pool.ts";
import { notConfigured } from "./errors.ts";

// ── In-memory cache ─────────────────────────────────────────────────────────────

const configStore = new Map<string, ApiConfig>();

/** Load all configs from Postgres on startup. Call once after initPool + runMigrations. */
export async function loadConfig(): Promise<void> {
    if (!isPoolAvailable()) return;

    const rows = await getAllConfigs();

    for (const row of rows) {
        const config: ApiConfig = {
            token: row.token,
            owner: row.owner,
            ownerType: row.owner_type,
        };
        configStore.set(row.owner.toLowerCase(), config);
        console.log(`[config] Loaded from database: ${config.ownerType}:${config.owner}`);
    }

    if (configStore.size === 0) {
        console.log("[config] No saved configurations found");
    } else {
        console.log(`[config] Loaded ${configStore.size} configuration(s)`);
    }
}

/** Get config for a specific owner (in-memory lookup). */
export function getConfig(owner: string): ApiConfig | null {
    return configStore.get(owner.toLowerCase()) ?? null;
}

/** Store/update config for an owner (in-memory + Postgres). */
export async function setConfig(config: ApiConfig): Promise<void> {
    const key = config.owner.toLowerCase();
    configStore.set(key, config);

    // Persist to Postgres via new owner_config table
    if (isPoolAvailable()) {
        await dbUpsertConfig(config.owner, config.token, config.ownerType);
    }
}

/** Delete config for an owner (in-memory + Postgres). */
export async function clearConfig(owner: string): Promise<void> {
    configStore.delete(owner.toLowerCase());

    if (isPoolAvailable()) {
        await dbDeleteConfig(owner);
    }
}

/**
 * Returns the config for a specific owner, or throws ApiError if not configured.
 * Route handlers use this to get the token and owner type for DB/API calls.
 */
export function requireConfig(owner: string): ApiConfig {
    const config = getConfig(owner);
    if (!config) throw notConfigured();
    return config;
}
