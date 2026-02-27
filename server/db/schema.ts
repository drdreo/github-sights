// ── Schema Migration Runner ─────────────────────────────────────────────────────
//
// Reads .sql files from server/db/migrations/ and executes them in order.
// Tracks applied migrations in a `schema_migrations` table to ensure idempotency.

import { query, execute, transaction } from "./pool.ts";

const MIGRATIONS_DIR = new URL("./migrations/", import.meta.url).pathname;

/** Ensure the migrations tracking table exists. */
async function ensureMigrationsTable(): Promise<void> {
    await execute(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
}

/** Get list of already-applied migration names. */
async function getAppliedMigrations(): Promise<Set<string>> {
    const rows = await query<{ name: string }>(
        "SELECT name FROM schema_migrations ORDER BY name"
    );
    return new Set(rows.map((r) => r.name));
}

/** Discover .sql files in the migrations directory, sorted by filename. */
async function discoverMigrations(): Promise<{ name: string; path: string }[]> {
    const entries: { name: string; path: string }[] = [];
    try {
        for await (const entry of Deno.readDir(MIGRATIONS_DIR)) {
            if (entry.isFile && entry.name.endsWith(".sql")) {
                entries.push({
                    name: entry.name,
                    path: `${MIGRATIONS_DIR}${entry.name}`,
                });
            }
        }
    } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
            console.warn("[db] No migrations directory found at", MIGRATIONS_DIR);
            return [];
        }
        throw err;
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Run all pending migrations in order.
 * Each migration is executed inside a transaction along with its tracking record.
 *
 * @returns Number of migrations applied
 */
export async function runMigrations(): Promise<number> {
    await ensureMigrationsTable();

    const applied = await getAppliedMigrations();
    const available = await discoverMigrations();
    const pending = available.filter((m) => !applied.has(m.name));

    if (pending.length === 0) {
        console.log("[db] Schema up to date — no pending migrations");
        return 0;
    }

    console.log(`[db] Running ${pending.length} migration(s)...`);

    for (const migration of pending) {
        const sql = await Deno.readTextFile(migration.path);
        await transaction(async (client) => {
            console.log(`[db]   > ${migration.name}`);
            await client.query(sql);
            await client.query(
                "INSERT INTO schema_migrations (name) VALUES ($1)",
                [migration.name]
            );
        });
        console.log(`[db]   ✓ ${migration.name}`);
    }

    console.log(`[db] ${pending.length} migration(s) applied`);
    return pending.length;
}
