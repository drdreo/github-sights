// ── Postgres Database Layer ─────────────────────────────────────────────────────

import pg from "pg";

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS config (
    owner TEXT PRIMARY KEY,
    token TEXT NOT NULL,
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
`;

const MIGRATION_DDL = `
  DO $$
  BEGIN
    -- Migrate old id-based config table to owner-based
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'config' AND column_name = 'id'
    ) THEN
      -- Create new table
      CREATE TABLE IF NOT EXISTS config_new (
        owner TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'org')),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      -- Migrate existing data
      INSERT INTO config_new (owner, token, owner_type, updated_at)
      SELECT owner, token, owner_type, updated_at FROM config
      ON CONFLICT (owner) DO NOTHING;
      -- Swap tables
      DROP TABLE config;
      ALTER TABLE config_new RENAME TO config;
      RAISE NOTICE 'Migrated config table from id-based to owner-based';
    END IF;
  END
  $$;
`;

/**
 * Initialize the database connection pool and create tables if they don't exist.
 * Must be called once at startup before any queries.
 */
export async function initDb(): Promise<void> {
    const connectionString = Deno.env.get("DATABASE_URL");
    if (!connectionString) {
        console.warn(
            "[db] DATABASE_URL not set — database features disabled. Set it in Deno Deploy dashboard or use --tunnel."
        );
        return;
    }

    pool = new Pool({
        connectionString,
        max: 3,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000
    });

    pool.on("error", (err: Error) => {
        console.error("[db] Unexpected pool error:", err.message);
    });

    try {
        await pool.query(MIGRATION_DDL);
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
    params?: unknown[]
): Promise<T[]> {
    if (!pool) return [];
    const result = await pool.query(text, params);
    return result.rows as T[];
}

/** Check if the database is connected and available. */
export function isDbAvailable(): boolean {
    return !!pool;
}
