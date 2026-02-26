// ── DataCache (generic, stale-while-revalidate) ─────────────────────────────
//
// A Postgres-backed key-value cache with in-memory hot layer.
// Each entry tracks when it was fetched. Callers use getWithAge() to check
// staleness and trigger background re-fetches when data exceeds its TTL.
//
// Architecture:
//   In-memory Map serves as a hot cache for fast reads.
//   All writes go to both memory and Postgres (write-through).
//   Reads check memory first, fall back to Postgres (read-through).

import { query, isDbAvailable } from "../db.ts";

interface CacheEntry<T> {
    data: T;
    fetchedAt: number; // epoch ms
}

/** Default TTL: 24 hours */
const DEFAULT_STALE_TTL_MS = 24 * 60 * 60 * 1000;

export interface DataCacheResult<T> {
    data: T;
    stale: boolean;
    fetchedAt: number; // epoch ms
}

export class DataCache<T> {
    private memStore = new Map<string, CacheEntry<T>>();

    constructor(
        private prefix: string,
        private staleTtlMs: number = DEFAULT_STALE_TTL_MS
    ) {}

    /**
     * Get cached data, or null if not cached.
     * Ignores staleness — always returns data if available.
     */
    async get(key: string): Promise<T | null> {
        const result = await this.getWithAge(key);
        return result?.data ?? null;
    }

    /**
     * Get cached data with staleness info.
     * Returns null if no data exists.
     * `stale: true` means the caller should trigger a background re-fetch.
     */
    async getWithAge(key: string): Promise<DataCacheResult<T> | null> {
        // 1. Check memory
        const memEntry = this.memStore.get(key);
        if (memEntry !== undefined) {
            const stale = Date.now() - memEntry.fetchedAt > this.staleTtlMs;
            return { data: memEntry.data, stale, fetchedAt: memEntry.fetchedAt };
        }

        // 2. Fallback to Postgres
        if (!isDbAvailable()) return null;

        const dbKey = `${this.prefix}:${key}`;
        const rows = await query<{ data: T; fetched_at: string | null }>(
            `SELECT data, fetched_at FROM data_cache WHERE key = $1`,
            [dbKey]
        );

        if (rows.length === 0) return null;

        const data = rows[0].data;
        const fetchedAt = rows[0].fetched_at ? new Date(rows[0].fetched_at).getTime() : 0; // treat missing timestamp as ancient → always stale

        // Populate memory from Postgres hit
        this.memStore.set(key, { data, fetchedAt });
        const stale = Date.now() - fetchedAt > this.staleTtlMs;
        return { data, stale, fetchedAt };
    }

    async set(key: string, data: T): Promise<void> {
        const now = Date.now();

        // Write to memory
        this.memStore.set(key, { data, fetchedAt: now });

        // Write to Postgres
        if (!isDbAvailable()) return;

        const dbKey = `${this.prefix}:${key}`;
        await query(
            `INSERT INTO data_cache (key, data, fetched_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET data = $2, fetched_at = NOW()`,
            [dbKey, JSON.stringify(data)]
        );
    }

    async invalidate(key: string): Promise<void> {
        this.memStore.delete(key);

        if (!isDbAvailable()) return;
        const dbKey = `${this.prefix}:${key}`;
        await query(`DELETE FROM data_cache WHERE key = $1`, [dbKey]);
    }

    async clear(): Promise<void> {
        this.memStore.clear();

        if (!isDbAvailable()) return;
        await query(`DELETE FROM data_cache WHERE key LIKE $1`, [`${this.prefix}:%`]);
    }
}
