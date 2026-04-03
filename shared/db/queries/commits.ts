// ── Commit Queries ──────────────────────────────────────────────────────────────
//
// Batch insert and query operations for commit_event.

import { query, transaction } from "../pool.ts";
import { buildMultiRowValues, BATCH_SIZE } from "../utils.ts";
import type { CommitEventWithAvatarRow } from "../types.ts";

export interface InsertCommitInput {
    sha: string;
    repo_id: number;
    author_login: string | null;
    committer_login: string | null;
    message: string | null;
    html_url: string | null;
    committed_at: string;
    additions: number;
    deletions: number;
    is_merge: boolean;
}

/** Batch insert commits. Skips duplicates (ON CONFLICT DO NOTHING). */
export async function insertCommits(commits: InsertCommitInput[]): Promise<number> {
    if (commits.length === 0) return 0;

    let inserted = 0;
    await transaction(async (client) => {
        for (let i = 0; i < commits.length; i += BATCH_SIZE) {
            const chunk = commits.slice(i, i + BATCH_SIZE);
            const { text, params } = buildMultiRowValues(chunk, (c) => [
                c.sha,
                String(c.repo_id),
                c.author_login,
                c.committer_login,
                c.message,
                c.html_url,
                c.committed_at,
                c.additions,
                c.deletions,
                c.is_merge
            ]);
            const result = await client.query(
                `INSERT INTO commit_event (
                    sha, repo_id, author_login, committer_login,
                    message, html_url, committed_at, additions, deletions, is_merge
                 ) VALUES ${text}
                 ON CONFLICT (sha) DO UPDATE SET is_merge = EXCLUDED.is_merge`,
                params
            );
            inserted += result.rowCount ?? 0;
        }
    });
    return inserted;
}

/** Get commits for a repo within a date range, with avatar URLs from contributor_profile. */
export async function getCommitsByRepo(
    repoId: number,
    options?: { since?: string; until?: string }
): Promise<CommitEventWithAvatarRow[]> {
    const conditions = ["ce.repo_id = $1"];
    const params: unknown[] = [repoId];
    let idx = 2;

    if (options?.since) {
        conditions.push(`ce.committed_at >= $${idx}`);
        params.push(options.since);
        idx++;
    }
    if (options?.until) {
        conditions.push(`ce.committed_at <= $${idx}`);
        params.push(options.until);
        idx++;
    }

    return query<CommitEventWithAvatarRow>(
        `SELECT ce.*,
                cp_a.avatar_url AS author_avatar_url,
                cp_c.avatar_url AS committer_avatar_url
         FROM commit_event ce
         LEFT JOIN contributor_profile cp_a ON cp_a.login = ce.author_login
         LEFT JOIN contributor_profile cp_c ON cp_c.login = ce.committer_login
         WHERE ${conditions.join(" AND ")}
         ORDER BY ce.committed_at DESC`,
        params
    );
}

/** Get all commits for an owner (across all repos) within a date range, with avatar URLs. */
export async function getCommitsByOwner(
    ownerLogin: string,
    options?: { since?: string; until?: string }
): Promise<CommitEventWithAvatarRow[]> {
    const conditions = ["ce.repo_id = rm.id", "rm.owner_login = $1"];
    const params: unknown[] = [ownerLogin];
    let idx = 2;

    if (options?.since) {
        conditions.push(`ce.committed_at >= $${idx}`);
        params.push(options.since);
        idx++;
    }
    if (options?.until) {
        conditions.push(`ce.committed_at <= $${idx}`);
        params.push(options.until);
        idx++;
    }

    return query<CommitEventWithAvatarRow>(
        `SELECT ce.*,
                cp_a.avatar_url AS author_avatar_url,
                cp_c.avatar_url AS committer_avatar_url
         FROM commit_event ce
         JOIN repository_meta rm ON ce.repo_id = rm.id
         LEFT JOIN contributor_profile cp_a ON cp_a.login = ce.author_login
         LEFT JOIN contributor_profile cp_c ON cp_c.login = ce.committer_login
         WHERE ${conditions.join(" AND ")}
         ORDER BY ce.committed_at DESC`,
        params
    );
}

/** Get contributor stats for a repo (commits grouped by author). */
export async function getContributorStatsByRepo(repoId: number): Promise<
    Array<{
        login: string;
        avatar_url: string | null;
        commits: number;
        additions: number;
        deletions: number;
    }>
> {
    return query<{
        login: string;
        avatar_url: string | null;
        commits: number;
        additions: number;
        deletions: number;
    }>(
        `SELECT
            c.author_login AS login,
            cp.avatar_url,
            COUNT(*)::INTEGER AS commits,
            COALESCE(SUM(c.additions) FILTER (WHERE c.is_merge = false), 0)::BIGINT AS additions,
            COALESCE(SUM(c.deletions) FILTER (WHERE c.is_merge = false), 0)::BIGINT AS deletions
         FROM commit_event c
         LEFT JOIN contributor_profile cp ON cp.login = c.author_login
         WHERE c.repo_id = $1 AND c.author_login IS NOT NULL
         GROUP BY c.author_login, cp.avatar_url
         ORDER BY commits DESC`,
        [repoId]
    );
}
