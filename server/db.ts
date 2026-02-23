// ── Postgres Database Layer ─────────────────────────────────────────────────────

import pg from "pg";

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    token TEXT NOT NULL,
    owner TEXT NOT NULL,
    owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'org')),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS repo_commits (
    repo_key TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    fetched_since DATE,
    fetched_until DATE,
    last_fetched_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS data_cache (
    key TEXT PRIMARY KEY,
    data JSONB NOT NULL
  );

  DROP TABLE IF EXISTS cached_commits;
  DROP TABLE IF EXISTS commit_ranges;
`;

/**
 * Initialize the database connection pool and create tables if they don't exist.
 * Must be called once at startup before any queries.
 */
export async function initDb(): Promise<void> {
    const connectionString = Deno.env.get("DATABASE_URL");
    if (!connectionString) {
        console.warn(
            "[db] DATABASE_URL not set — database features disabled. Set it in Deno Deploy dashboard or use --tunnel.",
        );
        return;
    }

    pool = new Pool({
        connectionString,
        max: 3,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
    });

    pool.on("error", (err: Error) => {
        console.error("[db] Unexpected pool error:", err.message);
    });

    try {
        await pool.query(SCHEMA_DDL);
        console.log("[db] Connected and schema verified");
    } catch (err) {
        console.error("[db] Failed to initialize:", err);
        throw err;
    }
}

/**
 * Execute a parameterized query and return typed rows.
 *
 * @example
 * const rows = await query<{ owner: string }>("SELECT owner FROM config WHERE id = 1");
 */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
): Promise<T[]> {
    if (!pool) return [];
    const result = await pool.query(text, params);
    return result.rows as T[];
}

/** Check if the database is connected and available. */
export function isDbAvailable(): boolean {
    return !!pool;
}
