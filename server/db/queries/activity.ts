// ── Daily Activity Queries ────────────────────────────────────────────────────────
//
// Insert and query daily_activity rows for time-series data.
// Supports owner-level, repo-level, and contributor-level granularity.

import { query, execute, transaction } from "../pool.ts";
import type { DailyActivityRow } from "../types.ts";

// ── Insert / Upsert ──────────────────────────────────────────────────────────────

export interface UpsertDailyActivityInput {
    owner_login: string;
    repo_id: number | null;
    contributor_login: string | null;
    date: string;
    commit_count: number;
    additions: number;
    deletions: number;
    pr_opened: number;
    pr_merged: number;
    pr_closed: number;
    workflow_runs: number;
    workflow_failures: number;
}

const ACTIVITY_BATCH_SIZE = 500;

/**
 * Batch upsert daily activity rows.
 * Chunks into batches of 500 with multi-row VALUES for efficiency.
 * Uses the composite unique index for conflict resolution.
 */
export async function upsertDailyActivity(rows: UpsertDailyActivityInput[]): Promise<void> {
    if (rows.length === 0) return;

    const COLS_PER_ROW = 12; // excludes computed_at (uses NOW())

    await transaction(async (client) => {
        for (let offset = 0; offset < rows.length; offset += ACTIVITY_BATCH_SIZE) {
            const chunk = rows.slice(offset, offset + ACTIVITY_BATCH_SIZE);

            const params: unknown[] = [];
            const tuples: string[] = [];
            let idx = 1;
            for (const r of chunk) {
                const placeholders = Array.from({ length: COLS_PER_ROW }, () => `$${idx++}`);
                tuples.push(`(${placeholders.join(",")},NOW())`);
                params.push(
                    r.owner_login,
                    r.repo_id,
                    r.contributor_login,
                    r.date,
                    r.commit_count,
                    r.additions,
                    r.deletions,
                    r.pr_opened,
                    r.pr_merged,
                    r.pr_closed,
                    r.workflow_runs,
                    r.workflow_failures
                );
            }

            await client.query(
                `INSERT INTO daily_activity (
                    owner_login, repo_id, contributor_login, date,
                    commit_count, additions, deletions,
                    pr_opened, pr_merged, pr_closed,
                    workflow_runs, workflow_failures, computed_at
                 ) VALUES ${tuples.join(",")}
                 ON CONFLICT (owner_login, date, COALESCE(repo_id, -1), COALESCE(contributor_login, ''))
                 DO UPDATE SET
                    commit_count = EXCLUDED.commit_count,
                    additions = EXCLUDED.additions,
                    deletions = EXCLUDED.deletions,
                    pr_opened = EXCLUDED.pr_opened,
                    pr_merged = EXCLUDED.pr_merged,
                    pr_closed = EXCLUDED.pr_closed,
                    workflow_runs = EXCLUDED.workflow_runs,
                    workflow_failures = EXCLUDED.workflow_failures,
                    computed_at = NOW()`,
                params
            );
        }
    });
}

// ── Queries ──────────────────────────────────────────────────────────────────────

/** Get owner-level daily activity (repo_id IS NULL, contributor_login IS NULL). */
export async function getOwnerDailyActivity(
    ownerLogin: string,
    options?: { since?: string; until?: string }
): Promise<DailyActivityRow[]> {
    const conditions = ["owner_login = $1", "repo_id IS NULL", "contributor_login IS NULL"];
    const params: unknown[] = [ownerLogin];
    let idx = 2;

    if (options?.since) {
        conditions.push(`date >= $${idx}`);
        params.push(options.since);
        idx++;
    }
    if (options?.until) {
        conditions.push(`date <= $${idx}`);
        params.push(options.until);
        idx++;
    }

    return query<DailyActivityRow>(
        `SELECT * FROM daily_activity
         WHERE ${conditions.join(" AND ")}
         ORDER BY date`,
        params
    );
}

/** Get per-repo daily activity. */
export async function getRepoDailyActivity(
    repoId: number,
    options?: { since?: string; until?: string }
): Promise<DailyActivityRow[]> {
    const conditions = ["repo_id = $1", "contributor_login IS NULL"];
    const params: unknown[] = [repoId];
    let idx = 2;

    if (options?.since) {
        conditions.push(`date >= $${idx}`);
        params.push(options.since);
        idx++;
    }
    if (options?.until) {
        conditions.push(`date <= $${idx}`);
        params.push(options.until);
        idx++;
    }

    return query<DailyActivityRow>(
        `SELECT * FROM daily_activity
         WHERE ${conditions.join(" AND ")}
         ORDER BY date`,
        params
    );
}

/**
 * Aggregate daily activity over a date range for an owner.
 * Returns summed totals (useful for date-range filtered stats).
 */
export async function aggregateOwnerActivity(
    ownerLogin: string,
    since: string,
    until: string
): Promise<{
    total_commits: number;
    total_additions: number;
    total_deletions: number;
    total_pr_opened: number;
    total_pr_merged: number;
    total_pr_closed: number;
} | null> {
    return query<{
        total_commits: number;
        total_additions: number;
        total_deletions: number;
        total_pr_opened: number;
        total_pr_merged: number;
        total_pr_closed: number;
    }>(
        `SELECT
            COALESCE(SUM(commit_count), 0)::INTEGER AS total_commits,
            COALESCE(SUM(additions), 0)::BIGINT AS total_additions,
            COALESCE(SUM(deletions), 0)::BIGINT AS total_deletions,
            COALESCE(SUM(pr_opened), 0)::INTEGER AS total_pr_opened,
            COALESCE(SUM(pr_merged), 0)::INTEGER AS total_pr_merged,
            COALESCE(SUM(pr_closed), 0)::INTEGER AS total_pr_closed
         FROM daily_activity
         WHERE owner_login = $1
           AND repo_id IS NULL AND contributor_login IS NULL
           AND date BETWEEN $2 AND $3`,
        [ownerLogin, since, until]
    ).then((rows) => rows[0] ?? null);
}

// ── Contributor Activity Aggregation ─────────────────────────────────────────────

export interface ContributorActivityRow {
    login: string;
    avatar_url: string | null;
    html_url: string | null;
    total_commits: number;
    total_additions: number;
    total_deletions: number;
    total_prs: number;
    repos: string[];
}

/**
 * Aggregate contributor stats from commit_event + pr_event for a date range.
 * Used when the contributors page has a date filter applied.
 */
export async function aggregateContributorActivity(
    owner: string,
    since: string,
    until: string
): Promise<ContributorActivityRow[]> {
    return query<ContributorActivityRow>(
        `WITH commit_stats AS (
            SELECT
                ce.author_login AS login,
                COUNT(*)::INTEGER AS total_commits,
                COALESCE(SUM(ce.additions) FILTER (WHERE ce.is_merge = false), 0)::BIGINT AS total_additions,
                COALESCE(SUM(ce.deletions) FILTER (WHERE ce.is_merge = false), 0)::BIGINT AS total_deletions,
                ARRAY_AGG(DISTINCT rm.name) AS commit_repos
            FROM commit_event ce
            JOIN repository_meta rm ON rm.id = ce.repo_id
            WHERE rm.owner_login = $1
              AND ce.committed_at >= $2::TIMESTAMPTZ
              AND ce.committed_at < ($3::TIMESTAMPTZ + INTERVAL '1 day')
              AND ce.author_login IS NOT NULL
            GROUP BY ce.author_login
        ),
        pr_stats AS (
            SELECT
                pe.author_login AS login,
                COUNT(*)::INTEGER AS total_prs,
                ARRAY_AGG(DISTINCT rm.name) AS pr_repos
            FROM pr_event pe
            JOIN repository_meta rm ON rm.id = pe.repo_id
            WHERE rm.owner_login = $1
              AND pe.created_at >= $2::TIMESTAMPTZ
              AND pe.created_at < ($3::TIMESTAMPTZ + INTERVAL '1 day')
              AND pe.author_login IS NOT NULL
            GROUP BY pe.author_login
        ),
        combined AS (
            SELECT COALESCE(c.login, p.login) AS login,
                   COALESCE(c.total_commits, 0) AS total_commits,
                   COALESCE(c.total_additions, 0) AS total_additions,
                   COALESCE(c.total_deletions, 0) AS total_deletions,
                   COALESCE(p.total_prs, 0) AS total_prs,
                   c.commit_repos,
                   p.pr_repos
            FROM commit_stats c
            FULL OUTER JOIN pr_stats p ON c.login = p.login
        )
        SELECT
            combined.login,
            cp.avatar_url,
            cp.html_url,
            combined.total_commits,
            combined.total_additions,
            combined.total_deletions,
            combined.total_prs,
            (SELECT ARRAY_AGG(DISTINCT r) FROM UNNEST(
                COALESCE(combined.commit_repos, '{}') || COALESCE(combined.pr_repos, '{}')
            ) AS r) AS repos
        FROM combined
        LEFT JOIN contributor_profile cp ON cp.login = combined.login
        ORDER BY combined.total_commits DESC, combined.total_prs DESC`,
        [owner, since, until]
    );
}

// ── Contributor Detail Queries ────────────────────────────────────────────────

/** Get daily activity time-series for a specific contributor. */
export async function getContributorDailyActivity(
    ownerLogin: string,
    contributorLogin: string
): Promise<DailyActivityRow[]> {
    return query<DailyActivityRow>(
        `SELECT * FROM daily_activity
         WHERE owner_login = $1
           AND contributor_login = $2
           AND repo_id IS NULL
         ORDER BY date`,
        [ownerLogin, contributorLogin]
    );
}

export interface ContributorRepoBreakdownRow {
    repo: string;
    commits: number;
    additions: number;
    deletions: number;
    prs: number;
    prs_merged: number;
}

/** Aggregate per-repo breakdown for a contributor from event tables.
 *  LoC is sourced from non-merge commits (is_merge = false). */
export async function getContributorRepoBreakdown(
    ownerLogin: string,
    contributorLogin: string
): Promise<ContributorRepoBreakdownRow[]> {
    return query<ContributorRepoBreakdownRow>(
        `WITH commit_stats AS (
            SELECT
                rm.name AS repo,
                COUNT(*)::INTEGER AS commits,
                COALESCE(SUM(ce.additions), 0)::BIGINT AS additions,
                COALESCE(SUM(ce.deletions), 0)::BIGINT AS deletions
            FROM commit_event ce
            JOIN repository_meta rm ON rm.id = ce.repo_id
            WHERE rm.owner_login = $1
              AND ce.author_login = $2
              AND ce.is_merge = false
            GROUP BY rm.name
        ),
        pr_stats AS (
            SELECT
                rm.name AS repo,
                COUNT(*)::INTEGER AS prs,
                COUNT(*) FILTER (WHERE pe.merged_at IS NOT NULL)::INTEGER AS prs_merged
            FROM pr_event pe
            JOIN repository_meta rm ON rm.id = pe.repo_id
            WHERE rm.owner_login = $1
              AND pe.author_login = $2
            GROUP BY rm.name
        )
        SELECT
            COALESCE(c.repo, p.repo) AS repo,
            COALESCE(c.commits, 0) AS commits,
            COALESCE(c.additions, 0) AS additions,
            COALESCE(c.deletions, 0) AS deletions,
            COALESCE(p.prs, 0) AS prs,
            COALESCE(p.prs_merged, 0) AS prs_merged
        FROM commit_stats c
        FULL OUTER JOIN pr_stats p ON c.repo = p.repo
        ORDER BY COALESCE(c.commits, 0) DESC`,
        [ownerLogin, contributorLogin]
    );
}

/** Delete all daily_activity for an owner (used before full rebuild). */
export async function clearDailyActivity(ownerLogin: string): Promise<void> {
    await execute("DELETE FROM daily_activity WHERE owner_login = $1", [ownerLogin]);
}

/** Delete daily_activity for a specific repo (used before per-repo rebuild). */
export async function clearRepoDailyActivity(repoId: number): Promise<void> {
    await execute("DELETE FROM daily_activity WHERE repo_id = $1", [repoId]);
}
