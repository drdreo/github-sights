import type { ApiConfig } from "./types.ts";
import { GitHubService } from "./github.ts";
import { notConfigured } from "./errors.ts";
import { clearAllCaches } from "./cache.ts";
import { query, isDbAvailable } from "./db.ts";

// ── Config Store (in-memory + Postgres) ─────────────────────────────────────────

let storedConfig: ApiConfig | null = null;
let cachedService: GitHubService | null = null;

/** Load config from Postgres on startup. Call once after initDb(). */
export async function loadConfig(): Promise<void> {
    if (!isDbAvailable()) return;

    const rows = await query<{
        token: string;
        owner: string;
        owner_type: "user" | "org";
    }>("SELECT token, owner, owner_type FROM config WHERE id = 1");

    if (rows.length > 0) {
        const row = rows[0];
        storedConfig = {
            token: row.token,
            owner: row.owner,
            ownerType: row.owner_type
        };
        console.log(
            `[config] Loaded from database: ${storedConfig.ownerType}:${storedConfig.owner}`
        );
    } else {
        console.log("[config] No saved configuration found");
    }
}

export function getConfig(): ApiConfig | null {
    return storedConfig;
}

export async function setConfig(config: ApiConfig): Promise<void> {
    const ownerChanged =
        storedConfig?.owner !== config.owner || storedConfig?.ownerType !== config.ownerType;

    storedConfig = config;
    cachedService = new GitHubService(config.token);

    // Persist to Postgres
    if (isDbAvailable()) {
        await query(
            `INSERT INTO config (id, token, owner, owner_type, updated_at)
       VALUES (1, $1, $2, $3, NOW())
       ON CONFLICT (id) DO UPDATE SET
         token = $1, owner = $2, owner_type = $3, updated_at = NOW()`,
            [config.token, config.owner, config.ownerType]
        );
    }

    // Clear cached data when switching to a different owner/org
    if (ownerChanged) {
        await clearAllCaches();
    }
}

export async function clearConfig(): Promise<void> {
    storedConfig = null;
    cachedService = null;

    if (isDbAvailable()) {
        await query(`DELETE FROM config WHERE id = 1`);
    }

    await clearAllCaches();
}

/** Returns the service + config or throws ApiError if not configured. */
export function requireService(): { service: GitHubService; config: ApiConfig } {
    if (!storedConfig) throw notConfigured();
    if (!cachedService) {
        cachedService = new GitHubService(storedConfig.token);
    }
    return {
        service: cachedService,
        config: storedConfig
    };
}
