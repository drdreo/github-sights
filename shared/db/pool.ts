// ── Database Pool & Query Infrastructure ────────────────────────────────────────
//
// Single connection pool shared by all db/ modules.
// Provides: typed queries, transaction support, migration runner.

import pg from "pg";

const { Pool, types } = pg;

// Parse BIGINT (OID 20) as JS number instead of string.
// GitHub IDs max out around ~2B — well within JS safe integer range (2^53).
// Using Number() instead of parseInt: returns NaN on overflow rather than silent truncation.
types.setTypeParser(20, (val: string) => Number(val));

// ── Types ────────────────────────────────────────────────────────────────────────

type PoolClient = pg.PoolClient;

export interface QueryResult<T> {
    rows: T[];
    rowCount: number | null;
}

// ── Pool singleton ───────────────────────────────────────────────────────────────

let pool: InstanceType<typeof Pool> | null = null;

/**
 * Initialize the connection pool. Must be called once at startup.
 * Returns `false` if DATABASE_URL is not set (graceful degradation).
 */
export async function initPool(): Promise<boolean> {
    const connectionString = Deno.env.get("DATABASE_URL");
    if (!connectionString) {
        console.warn("[db] DATABASE_URL not set — database features disabled.");
        return false;
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

    // Verify connectivity
    const client = await pool.connect();
    client.release();
    console.log("[db] Pool connected");
    return true;
}

// ── Query helpers ────────────────────────────────────────────────────────────────

/**
 * Execute a parameterized query and return typed rows.
 *
 * @example
 * const rows = await query<OwnerRow>("SELECT * FROM owner WHERE login = $1", [login]);
 */
export async function query<T extends Record<string, any> = Record<string, any>>(
    text: string,
    params?: unknown[]
): Promise<T[]> {
    if (!pool) return [];
    const result = await pool.query(text, params);
    return result.rows as T[];
}

/**
 * Execute a query and return the full result (rows + rowCount).
 * Useful for INSERT/UPDATE/DELETE where you need affected row count.
 */
export async function execute<T extends Record<string, any> = Record<string, any>>(
    text: string,
    params?: unknown[]
): Promise<QueryResult<T>> {
    if (!pool) return { rows: [], rowCount: 0 };
    const result = await pool.query(text, params);
    return { rows: result.rows as T[], rowCount: result.rowCount };
}

/**
 * Execute a query and return exactly one row, or null if not found.
 */
export async function queryOne<T extends Record<string, any> = Record<string, any>>(
    text: string,
    params?: unknown[]
): Promise<T | null> {
    const rows = await query<T>(text, params);
    return rows[0] ?? null;
}

// ── Transactions ─────────────────────────────────────────────────────────────────

/**
 * Execute `fn` inside a database transaction. Auto-commits on success, rolls back on error.
 *
 * @example
 * await transaction(async (tx) => {
 *   await tx.query("INSERT INTO ...", []);
 *   await tx.query("UPDATE ...", []);
 * });
 */
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!pool) throw new Error("[db] Pool not initialized");
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

// ── Pool status ──────────────────────────────────────────────────────────────────

/** Check if the pool has been initialized and is available. */
export function isPoolAvailable(): boolean {
    return pool !== null;
}

/** Pool statistics for health endpoint. */
export function poolStats(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
} {
    if (!pool) return { totalCount: 0, idleCount: 0, waitingCount: 0 };
    return {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
    };
}

/** Gracefully close the pool. Call on shutdown. */
export async function closePool(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
        console.log("[db] Pool closed");
    }
}
