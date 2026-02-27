// ── Event Queries ────────────────────────────────────────────────────────────────
//
// Batch insert and query operations for commit_event, pr_event, and workflow_event.

import { query, execute, transaction } from "../pool.ts";
import type { CommitEventRow, PrEventRow, WorkflowEventRow } from "../types.ts";

const BATCH_SIZE = 500;

/**
 * Build a multi-row VALUES clause with positional parameters.
 * Returns { text: '($1,$2,...),($3,$4,...)', params: [...flatValues] }
 */
function buildMultiRowValues<T>(
    rows: T[],
    extractor: (row: T) => unknown[]
): { text: string; params: unknown[] } {
    const params: unknown[] = [];
    const tuples: string[] = [];
    let idx = 1;
    for (const row of rows) {
        const values = extractor(row);
        const placeholders = values.map(() => `$${idx++}`);
        tuples.push(`(${placeholders.join(",")})`);
        params.push(...values);
    }
    return { text: tuples.join(","), params };
}
// ── Commit Events ────────────────────────────────────────────────────────────────

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
}

/** Batch insert commits. Skips duplicates (ON CONFLICT DO NOTHING). */
export async function insertCommits(commits: InsertCommitInput[]): Promise<number> {
    if (commits.length === 0) return 0;

    let inserted = 0;
    await transaction(async (client) => {
        for (let i = 0; i < commits.length; i += BATCH_SIZE) {
            const chunk = commits.slice(i, i + BATCH_SIZE);
            const { text, params } = buildMultiRowValues(chunk, (c) => [
                c.sha, c.repo_id, c.author_login, c.committer_login,
                c.message, c.html_url, c.committed_at, c.additions, c.deletions,
            ]);
            const result = await client.query(
                `INSERT INTO commit_event (
                    sha, repo_id, author_login, committer_login,
                    message, html_url, committed_at, additions, deletions
                 ) VALUES ${text}
                 ON CONFLICT (sha) DO NOTHING`,
                params
            );
            inserted += result.rowCount ?? 0;
        }
    });
    return inserted;
}

/** Get commits for a repo within a date range. */
export async function getCommitsByRepo(
    repoId: number,
    options?: { since?: string; until?: string }
): Promise<CommitEventRow[]> {
    const conditions = ["repo_id = $1"];
    const params: unknown[] = [repoId];
    let idx = 2;

    if (options?.since) {
        conditions.push(`committed_at >= $${idx}`);
        params.push(options.since);
        idx++;
    }
    if (options?.until) {
        conditions.push(`committed_at <= $${idx}`);
        params.push(options.until);
        idx++;
    }

    return query<CommitEventRow>(
        `SELECT * FROM commit_event
         WHERE ${conditions.join(" AND ")}
         ORDER BY committed_at DESC`,
        params
    );
}

/** Get all commits for an owner (across all repos) within a date range. */
export async function getCommitsByOwner(
    ownerLogin: string,
    options?: { since?: string; until?: string }
): Promise<CommitEventRow[]> {
    const conditions = [
        "ce.repo_id = rm.id",
        "rm.owner_login = $1",
    ];
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

    return query<CommitEventRow>(
        `SELECT ce.* FROM commit_event ce, repository_meta rm
         WHERE ${conditions.join(" AND ")}
         ORDER BY ce.committed_at DESC`,
        params
    );
}

// ── Pull Request Events ──────────────────────────────────────────────────────────

export interface InsertPrInput {
    id: number;
    repo_id: number;
    number: number;
    author_login: string | null;
    title: string | null;
    state: "open" | "closed";
    is_draft: boolean;
    html_url: string | null;
    base_ref: string | null;
    head_ref: string | null;
    additions: number;
    deletions: number;
    changed_files: number;
    created_at: string;
    closed_at: string | null;
    merged_at: string | null;
}

/** Batch upsert PRs. Upserts because PR state can change. */
export async function upsertPrs(prs: InsertPrInput[]): Promise<number> {
    if (prs.length === 0) return 0;

    let upserted = 0;
    await transaction(async (client) => {
        for (let i = 0; i < prs.length; i += BATCH_SIZE) {
            const chunk = prs.slice(i, i + BATCH_SIZE);
            const { text, params } = buildMultiRowValues(chunk, (pr) => [
                pr.id, pr.repo_id, pr.number, pr.author_login, pr.title,
                pr.state, pr.is_draft, pr.html_url, pr.base_ref, pr.head_ref,
                pr.additions, pr.deletions, pr.changed_files,
                pr.created_at, pr.closed_at, pr.merged_at,
            ]);
            const result = await client.query(
                `INSERT INTO pr_event (
                    id, repo_id, number, author_login, title, state,
                    is_draft, html_url, base_ref, head_ref,
                    additions, deletions, changed_files,
                    created_at, closed_at, merged_at
                 ) VALUES ${text}
                 ON CONFLICT (id) DO UPDATE SET
                    state = EXCLUDED.state,
                    is_draft = EXCLUDED.is_draft,
                    title = EXCLUDED.title,
                    additions = EXCLUDED.additions,
                    deletions = EXCLUDED.deletions,
                    changed_files = EXCLUDED.changed_files,
                    closed_at = EXCLUDED.closed_at,
                    merged_at = EXCLUDED.merged_at,
                    ingested_at = NOW()`,
                params
            );
            upserted += result.rowCount ?? 0;
        }
    });
    return upserted;
}

/** Get PRs for a repo, optionally filtered by state. */
export async function getPrsByRepo(
    repoId: number,
    options?: { state?: "open" | "closed" | "all" }
): Promise<PrEventRow[]> {
    const conditions = ["repo_id = $1"];
    const params: unknown[] = [repoId];

    if (options?.state && options.state !== "all") {
        conditions.push("state = $2");
        params.push(options.state);
    }

    return query<PrEventRow>(
        `SELECT * FROM pr_event
         WHERE ${conditions.join(" AND ")}
         ORDER BY created_at DESC`,
        params
    );
}

/** Get contributor stats for a repo (commits grouped by author). */
export async function getContributorStatsByRepo(
    repoId: number
): Promise<Array<{ login: string; commits: number; additions: number; deletions: number }>> {
    return query<{ login: string; commits: number; additions: number; deletions: number }>(
        `SELECT
            author_login AS login,
            COUNT(*)::INTEGER AS commits,
            COALESCE(SUM(additions), 0)::INTEGER AS additions,
            COALESCE(SUM(deletions), 0)::INTEGER AS deletions
         FROM commit_event
         WHERE repo_id = $1 AND author_login IS NOT NULL
         GROUP BY author_login
         ORDER BY commits DESC`,
        [repoId]
    );
}

// ── Workflow Events (schema ready, ingestion deferred) ───────────────────────────

export interface InsertWorkflowInput {
    id: number;
    repo_id: number;
    workflow_name: string | null;
    workflow_path: string | null;
    actor_login: string | null;
    run_number: number | null;
    status: "completed" | "in_progress" | "queued" | null;
    conclusion: string | null;
    head_branch: string | null;
    head_sha: string | null;
    duration_seconds: number | null;
    created_at: string;
}

/** Batch insert workflow events. */
export async function insertWorkflows(workflows: InsertWorkflowInput[]): Promise<number> {
    if (workflows.length === 0) return 0;

    let inserted = 0;
    await transaction(async (client) => {
        for (let i = 0; i < workflows.length; i += BATCH_SIZE) {
            const chunk = workflows.slice(i, i + BATCH_SIZE);
            const { text, params } = buildMultiRowValues(chunk, (w) => [
                w.id, w.repo_id, w.workflow_name, w.workflow_path, w.actor_login,
                w.run_number, w.status, w.conclusion, w.head_branch, w.head_sha,
                w.duration_seconds, w.created_at,
            ]);
            const result = await client.query(
                `INSERT INTO workflow_event (
                    id, repo_id, workflow_name, workflow_path, actor_login,
                    run_number, status, conclusion, head_branch, head_sha,
                    duration_seconds, created_at
                 ) VALUES ${text}
                 ON CONFLICT (id) DO NOTHING`,
                params
            );
            inserted += result.rowCount ?? 0;
        }
    });
    return inserted;
}
