import type { ApiConfig } from "./types.ts";
import { GitHubService } from "./github.ts";
import { notConfigured } from "./errors.ts";
import { clearAllCaches } from "./cache.ts";
import { query, isDbAvailable } from "./db.ts";

// ── Config Store (in-memory + Postgres) ─────────────────────────────

interface OwnerEntry {
    config: ApiConfig;
    service: GitHubService;
}

const configStore = new Map<string, OwnerEntry>();

/** Load all configs from Postgres on startup. Call once after initDb(). */
export async function loadConfig(): Promise<void> {
    if (!isDbAvailable()) return;

    const rows = await query<{
        token: string;
        owner: string;
        owner_type: "user" | "org";
    }>("SELECT token, owner, owner_type FROM config");

    for (const row of rows) {
        const config: ApiConfig = {
            token: row.token,
            owner: row.owner,
            ownerType: row.owner_type
        };
        configStore.set(row.owner.toLowerCase(), {
            config,
            service: new GitHubService(config.token)
        });
        console.log(`[config] Loaded from database: ${config.ownerType}:${config.owner}`);
    }

    if (configStore.size === 0) {
        console.log("[config] No saved configurations found");
    } else {
        console.log(`[config] Loaded ${configStore.size} configuration(s)`);
    }
}

export function getConfig(owner: string): ApiConfig | null {
    return configStore.get(owner.toLowerCase())?.config ?? null;
}

export async function setConfig(config: ApiConfig): Promise<void> {
    const key = config.owner.toLowerCase();
    const existing = configStore.get(key);

    const ownerChanged =
        existing?.config.owner !== config.owner ||
        existing?.config.ownerType !== config.ownerType;

    configStore.set(key, {
        config,
        service: new GitHubService(config.token)
    });

    // Persist to Postgres
    if (isDbAvailable()) {
        await query(
            `INSERT INTO config (owner, token, owner_type, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (owner) DO UPDATE SET
         token = $2, owner_type = $3, updated_at = NOW()`,
            [config.owner, config.token, config.ownerType]
        );
    }

    // Clear cached data when switching owner type
    if (ownerChanged && existing) {
        await clearAllCaches();
    }
}

export async function clearConfig(owner: string): Promise<void> {
    configStore.delete(owner.toLowerCase());

    if (isDbAvailable()) {
        await query(`DELETE FROM config WHERE LOWER(owner) = LOWER($1)`, [owner]);
    }

    await clearAllCaches();
}

/** Returns the service + config for a specific owner, or throws ApiError if not configured. */
export function requireService(owner: string): { service: GitHubService; config: ApiConfig } {
    const entry = configStore.get(owner.toLowerCase());
    if (!entry) throw notConfigured();
    return {
        service: entry.service,
        config: entry.config
    };
}
