// ── CommitCache (range-based, blob-per-repo) ────────────────────────────────
//
// Stores commits as one JSONB blob per repo with range metadata.
// Knows what date span has been covered and only fetches the gaps.
// Uses its own `repo_commits` table (not the generic `data_cache`).

import type { Commit } from "../types.ts";
import { query, isDbAvailable } from "../db.ts";

interface CommitBlobEntry {
    commits: Commit[];
    bySha: Set<string>;
    fetchedSince: string | null;
    fetchedUntil: string | null;
    lastFetchedAt: number;
}

/** How long before we consider "today" data stale and re-fetch the tail. */
const TAIL_STALE_MS = 10 * 60 * 1000; // 10 minutes

function toDateStr(d: Date): string {
    return d.toISOString().split("T")[0];
}

/**
 * Safely coerce a value from Postgres into a YYYY-MM-DD string.
 * pg returns DATE columns as Date objects, not strings.
 */
function toDateStrSafe(val: unknown): string | null {
    if (val == null) return null;
    if (val instanceof Date) return toDateStr(val);
    if (typeof val === "string") return val.split("T")[0];
    return String(val).split("T")[0];
}

function startOfDay(dateStr: string): string {
    return `${dateStr}T00:00:00Z`;
}

function endOfDay(dateStr: string): string {
    return `${dateStr}T23:59:59Z`;
}

export class CommitCache {
    private store = new Map<string, CommitBlobEntry>();

    private key(owner: string, repo: string): string {
        return `${owner}/${repo}`;
    }

    /** Ensure a repo's commits are loaded into memory from Postgres. */
    private async ensureLoaded(repoKey: string): Promise<CommitBlobEntry | null> {
        const existing = this.store.get(repoKey);
        if (existing) return existing;

        if (!isDbAvailable()) return null;

        const rows = await query<{
            data: Commit[];
            fetched_since: string | null;
            fetched_until: string | null;
            last_fetched_at: string;
        }>(
            `SELECT data, fetched_since, fetched_until, last_fetched_at FROM repo_commits WHERE repo_key = $1`,
            [repoKey]
        );

        if (rows.length === 0) return null;

        const row = rows[0];
        const commits: Commit[] = Array.isArray(row.data) ? row.data : [];
        const bySha = new Set<string>(commits.map((c) => c.sha));

        const entry: CommitBlobEntry = {
            commits,
            bySha,
            fetchedSince: toDateStrSafe(row.fetched_since),
            fetchedUntil: toDateStrSafe(row.fetched_until),
            lastFetchedAt: new Date(row.last_fetched_at).getTime()
        };

        this.store.set(repoKey, entry);
        console.log(`[cache] Loaded ${commits.length} commits for ${repoKey} from database`);
        return entry;
    }

    /**
     * Determines what date ranges (if any) still need fetching from GitHub
     * for the requested [since, until] window.
     *
     * Key principle: ONLY create gaps within the requested range.
     * Never fetch outside what the caller asked for.
     */
    async analyze(
        owner: string,
        repo: string,
        since?: string,
        until?: string
    ): Promise<{
        gaps: Array<{ since?: string; until?: string }>;
        cached: Commit[];
    }> {
        const k = this.key(owner, repo);
        const entry = await this.ensureLoaded(k);

        if (!entry || entry.commits.length === 0) {
            return { gaps: [{ since, until }], cached: [] };
        }

        const reqSince = since ? since.split("T")[0] : null;
        const reqUntil = until ? until.split("T")[0] : toDateStr(new Date());

        const cachedSince = entry.fetchedSince;
        const cachedUntil = entry.fetchedUntil || toDateStr(new Date());

        const gaps: Array<{ since?: string; until?: string }> = [];

        // Gap before cached range? Only if the request explicitly asks for it.
        if (reqSince && cachedSince && reqSince < cachedSince) {
            gaps.push({
                since: startOfDay(reqSince),
                until: startOfDay(cachedSince)
            });
        }

        // Gap after cached range? (or stale "today" data)
        const today = toDateStr(new Date());
        const tailIsStale = Date.now() - entry.lastFetchedAt > TAIL_STALE_MS;

        if (reqUntil > cachedUntil || (cachedUntil >= today && tailIsStale)) {
            const fetchFrom = cachedUntil < today ? endOfDay(cachedUntil) : undefined;
            gaps.push({
                since: fetchFrom || startOfDay(cachedUntil),
                until: until || undefined
            });
        }

        // NOTE: We intentionally do NOT fetch unbounded history.
        // If no `since` was requested, we return whatever is cached
        // and only fetch the forward gap (above). The caller gets
        // what we have — not all of GitHub history.

        const cached = this.filterByRange(entry, since, until);
        return { gaps, cached };
    }

    /** Merge newly fetched commits into the cache and expand the tracked range. */
    async merge(
        owner: string,
        repo: string,
        commits: Commit[],
        fetchedSince?: string,
        fetchedUntil?: string
    ): Promise<void> {
        const k = this.key(owner, repo);
        let entry = this.store.get(k);

        if (!entry) {
            entry = {
                commits: [],
                bySha: new Set(),
                fetchedSince: null,
                fetchedUntil: null,
                lastFetchedAt: Date.now()
            };
            this.store.set(k, entry);
        }

        // Deduplicate by SHA
        for (const commit of commits) {
            if (!entry.bySha.has(commit.sha)) {
                entry.commits.push(commit);
                entry.bySha.add(commit.sha);
            }
        }

        const sinceDateStr = fetchedSince?.split("T")[0] ?? null;
        const untilDateStr = fetchedUntil?.split("T")[0] ?? null;

        if (sinceDateStr) {
            if (!entry.fetchedSince || sinceDateStr < entry.fetchedSince) {
                entry.fetchedSince = sinceDateStr;
            }
        }

        if (untilDateStr) {
            if (!entry.fetchedUntil || untilDateStr > entry.fetchedUntil) {
                entry.fetchedUntil = untilDateStr;
            }
        } else {
            entry.fetchedUntil = toDateStr(new Date());
        }

        entry.lastFetchedAt = Date.now();

        // Write entire blob to Postgres in one operation
        if (!isDbAvailable()) return;

        await query(
            `INSERT INTO repo_commits (repo_key, data, fetched_since, fetched_until, last_fetched_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (repo_key) DO UPDATE SET
         data = $2,
         fetched_since = LEAST(repo_commits.fetched_since, $3),
         fetched_until = GREATEST(repo_commits.fetched_until, $4),
         last_fetched_at = NOW()`,
            [k, JSON.stringify(entry.commits), entry.fetchedSince, entry.fetchedUntil]
        );
    }

    /** Get all cached commits for a repo filtered by date range. */
    async get(owner: string, repo: string, since?: string, until?: string): Promise<Commit[]> {
        const k = this.key(owner, repo);
        const entry = await this.ensureLoaded(k);
        if (!entry) return [];
        return this.filterByRange(entry, since, until);
    }

    async invalidate(owner: string, repo: string): Promise<void> {
        const k = this.key(owner, repo);
        this.store.delete(k);

        if (!isDbAvailable()) return;
        await query(`DELETE FROM repo_commits WHERE repo_key = $1`, [k]);
    }

    async clear(): Promise<void> {
        this.store.clear();

        if (!isDbAvailable()) return;
        await query(`DELETE FROM repo_commits`);
    }

    /** Return cache stats for the health endpoint (sync — memory only). */
    stats(): { repos: number; totalCommits: number } {
        let totalCommits = 0;
        for (const entry of this.store.values()) {
            totalCommits += entry.commits.length;
        }
        return { repos: this.store.size, totalCommits };
    }

    private filterByRange(entry: CommitBlobEntry, since?: string, until?: string): Commit[] {
        if (!since && !until) return entry.commits;

        return entry.commits.filter((c) => {
            const date = c.author.date;
            if (since && date < since) return false;
            if (until && date > until) return false;
            return true;
        });
    }
}
