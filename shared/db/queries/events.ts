// ── Event Queries ────────────────────────────────────────────────────────────────
//
// Batch insert and query operations for commit_event, pr_event, and workflow_event.

import { query, transaction } from "../pool.ts";
import type { CommitEventWithAvatarRow, PrEventWithAvatarRow } from "../types.ts";

const BATCH_SIZE = 500;

/**
 * Build a multi-row VALUES clause with positional parameters.
 * Returns { text: '($1,$2,...),($3,$4,...)', params: [...flatValues] }
 */
export function buildMultiRowValues<T>(
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
                c.repo_id,
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
                pr.id,
                pr.repo_id,
                pr.number,
                pr.author_login,
                pr.title,
                pr.state,
                pr.is_draft,
                pr.html_url,
                pr.base_ref,
                pr.head_ref,
                pr.additions,
                pr.deletions,
                pr.changed_files,
                pr.created_at,
                pr.closed_at,
                pr.merged_at
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

/** Get PRs for a repo, optionally filtered by state, with avatar URLs from contributor_profile. */
export async function getPrsByRepo(
    repoId: number,
    options?: { state?: "open" | "closed" | "all" }
): Promise<PrEventWithAvatarRow[]> {
    const conditions = ["pe.repo_id = $1"];
    const params: unknown[] = [repoId];

    if (options?.state && options.state !== "all") {
        conditions.push("pe.state = $2");
        params.push(options.state);
    }

    return query<PrEventWithAvatarRow>(
        `SELECT pe.*,
                cp.avatar_url AS author_avatar_url
         FROM pr_event pe
         LEFT JOIN contributor_profile cp ON cp.login = pe.author_login
         WHERE ${conditions.join(" AND ")}
         ORDER BY pe.created_at DESC`,
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
            COALESCE(SUM(c.additions) FILTER (WHERE c.is_merge = false), 0)::INTEGER AS additions,
            COALESCE(SUM(c.deletions) FILTER (WHERE c.is_merge = false), 0)::INTEGER AS deletions
         FROM commit_event c
         LEFT JOIN contributor_profile cp ON cp.login = c.author_login
         WHERE c.repo_id = $1 AND c.author_login IS NOT NULL
         GROUP BY c.author_login, cp.avatar_url
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
    display_title: string | null;
    duration_seconds: number | null;
    created_at: string;
}

/** Get workflow runs for a repo, paginated. */
export async function getWorkflowsByRepo(
    repoId: number,
    options?: { limit?: number; offset?: number }
): Promise<import("../types.ts").WorkflowEventRow[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    return query<import("../types.ts").WorkflowEventRow>(
        `SELECT * FROM workflow_event
         WHERE repo_id = $1 AND status = 'completed'
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [repoId, limit, offset]
    );
}

/** Per-workflow-name breakdown stats for a repo. */
export async function getWorkflowStatsByRepo(repoId: number): Promise<
    Array<{
        workflow_name: string;
        workflow_path: string | null;
        total_runs: number;
        success_count: number;
        failure_count: number;
        cancelled_count: number;
        avg_duration_seconds: number;
        total_duration_seconds: number;
        success_rate: number;
    }>
> {
    return query(
        `SELECT
            COALESCE(workflow_name, 'Unknown') AS workflow_name,
            MAX(workflow_path) AS workflow_path,
            COUNT(*)::INTEGER AS total_runs,
            COUNT(*) FILTER (WHERE conclusion = 'success')::INTEGER AS success_count,
            COUNT(*) FILTER (WHERE conclusion = 'failure')::INTEGER AS failure_count,
            COUNT(*) FILTER (WHERE conclusion = 'cancelled')::INTEGER AS cancelled_count,
            COALESCE(AVG(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL), 0)::INTEGER AS avg_duration_seconds,
            COALESCE(SUM(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL), 0)::INTEGER AS total_duration_seconds,
            COALESCE(ROUND(COUNT(*) FILTER (WHERE conclusion = 'success')::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1), 0)::NUMERIC AS success_rate
         FROM workflow_event
         WHERE repo_id = $1 AND status = 'completed'
         GROUP BY workflow_name
         ORDER BY total_runs DESC`,
        [repoId]
    );
}

/** Owner-wide workflow stats for dashboard. */
export async function getWorkflowStatsByOwner(ownerLogin: string): Promise<{
    total_runs: number;
    total_duration_seconds: number;
    success_rate: number;
    avg_duration_seconds: number;
    top_failing_workflows: Array<{
        workflow_name: string;
        repo_name: string;
        failure_count: number;
    }>;
    top_contributors_by_minutes: Array<{
        login: string;
        total_duration_seconds: number;
        run_count: number;
    }>;
}> {
    const [totalsRows, topFailing, topContributors] = await Promise.all([
        query<{
            total_runs: number;
            total_duration_seconds: number;
            success_rate: number;
            avg_duration_seconds: number;
        }>(
            `SELECT
                COUNT(*)::INTEGER AS total_runs,
                COALESCE(SUM(we.duration_seconds), 0)::INTEGER AS total_duration_seconds,
                COALESCE(ROUND(COUNT(*) FILTER (WHERE we.conclusion = 'success')::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1), 0)::NUMERIC AS success_rate,
                COALESCE(AVG(we.duration_seconds) FILTER (WHERE we.duration_seconds IS NOT NULL), 0)::INTEGER AS avg_duration_seconds
             FROM workflow_event we
             JOIN repository_meta rm ON rm.id = we.repo_id
             WHERE rm.owner_login = $1 AND we.status = 'completed'`,
            [ownerLogin]
        ),
        query<{
            workflow_name: string;
            repo_name: string;
            failure_count: number;
        }>(
            `SELECT
                COALESCE(we.workflow_name, 'Unknown') AS workflow_name,
                rm.name AS repo_name,
                COUNT(*)::INTEGER AS failure_count
             FROM workflow_event we
             JOIN repository_meta rm ON rm.id = we.repo_id
             WHERE rm.owner_login = $1 AND we.status = 'completed' AND we.conclusion IN ('failure','timed_out')
             GROUP BY we.workflow_name, rm.name
             ORDER BY failure_count DESC
             LIMIT 5`,
            [ownerLogin]
        ),
        query<{
            login: string;
            total_duration_seconds: number;
            run_count: number;
        }>(
            `SELECT
                we.actor_login AS login,
                COALESCE(SUM(we.duration_seconds), 0)::INTEGER AS total_duration_seconds,
                COUNT(*)::INTEGER AS run_count
             FROM workflow_event we
             JOIN repository_meta rm ON rm.id = we.repo_id
             WHERE rm.owner_login = $1 AND we.status = 'completed' AND we.actor_login IS NOT NULL
             GROUP BY we.actor_login
             ORDER BY total_duration_seconds DESC
             LIMIT 10`,
            [ownerLogin]
        )
    ]);

    const totals = totalsRows[0];

    return {
        total_runs: totals?.total_runs ?? 0,
        total_duration_seconds: totals?.total_duration_seconds ?? 0,
        success_rate: Number(totals?.success_rate) || 0,
        avg_duration_seconds: totals?.avg_duration_seconds ?? 0,
        top_failing_workflows: topFailing,
        top_contributors_by_minutes: topContributors
    };
}

/** Batch insert workflow events. */
export async function insertWorkflows(workflows: InsertWorkflowInput[]): Promise<number> {
    if (workflows.length === 0) return 0;

    let inserted = 0;
    await transaction(async (client) => {
        for (let i = 0; i < workflows.length; i += BATCH_SIZE) {
            const chunk = workflows.slice(i, i + BATCH_SIZE);
            const { text, params } = buildMultiRowValues(chunk, (w) => [
                w.id,
                w.repo_id,
                w.workflow_name,
                w.workflow_path,
                w.actor_login,
                w.run_number,
                w.status,
                w.conclusion,
                w.head_branch,
                w.head_sha,
                w.display_title,
                w.duration_seconds,
                w.created_at
            ]);
            const result = await client.query(
                `INSERT INTO workflow_event (
                    id, repo_id, workflow_name, workflow_path, actor_login,
                    run_number, status, conclusion, head_branch, head_sha,
                    display_title, duration_seconds, created_at
                 ) VALUES ${text}
                 ON CONFLICT (id) DO NOTHING`,
                params
            );
            inserted += result.rowCount ?? 0;
        }
    });
    return inserted;
}

// ── Workflow Jobs & Steps ────────────────────────────────────────────────────

export interface InsertWorkflowJobInput {
    id: number;
    workflow_run_id: number;
    repo_id: number;
    name: string;
    status: string | null;
    conclusion: string | null;
    started_at: string | null;
    completed_at: string | null;
    duration_seconds: number;
    runner_name: string | null;
}

export interface InsertWorkflowStepInput {
    job_id: number;
    number: number;
    name: string;
    status: string | null;
    conclusion: string | null;
    started_at: string | null;
    completed_at: string | null;
    duration_seconds: number;
}

/** Batch insert workflow jobs. Skips duplicates. */
export async function insertWorkflowJobs(jobs: InsertWorkflowJobInput[]): Promise<number> {
    if (jobs.length === 0) return 0;

    let inserted = 0;
    await transaction(async (client) => {
        for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
            const chunk = jobs.slice(i, i + BATCH_SIZE);
            const { text, params } = buildMultiRowValues(chunk, (j) => [
                j.id,
                j.workflow_run_id,
                j.repo_id,
                j.name,
                j.status,
                j.conclusion,
                j.started_at,
                j.completed_at,
                j.duration_seconds,
                j.runner_name
            ]);
            const result = await client.query(
                `INSERT INTO workflow_job (
                    id, workflow_run_id, repo_id, name, status, conclusion,
                    started_at, completed_at, duration_seconds, runner_name
                 ) VALUES ${text}
                 ON CONFLICT (id) DO NOTHING`,
                params
            );
            inserted += result.rowCount ?? 0;
        }
    });
    return inserted;
}

/** Batch insert workflow steps. Skips duplicates. */
export async function insertWorkflowSteps(steps: InsertWorkflowStepInput[]): Promise<number> {
    if (steps.length === 0) return 0;

    let inserted = 0;
    await transaction(async (client) => {
        for (let i = 0; i < steps.length; i += BATCH_SIZE) {
            const chunk = steps.slice(i, i + BATCH_SIZE);
            const { text, params } = buildMultiRowValues(chunk, (s) => [
                s.job_id,
                s.number,
                s.name,
                s.status,
                s.conclusion,
                s.started_at,
                s.completed_at,
                s.duration_seconds
            ]);
            const result = await client.query(
                `INSERT INTO workflow_step (
                    job_id, number, name, status, conclusion,
                    started_at, completed_at, duration_seconds
                 ) VALUES ${text}
                 ON CONFLICT (job_id, number) DO NOTHING`,
                params
            );
            inserted += result.rowCount ?? 0;
        }
    });
    return inserted;
}

/** Get unfetched workflow runs for a repo (newest first), limited by budget. */
export async function getUnfetchedWorkflowRuns(
    repoId: number,
    limit: number
): Promise<{ id: number; repo_id: number }[]> {
    return query<{ id: number; repo_id: number }>(
        `SELECT id, repo_id FROM workflow_event
         WHERE repo_id = $1 AND jobs_fetched = FALSE AND status = 'completed'
         ORDER BY created_at DESC
         LIMIT $2`,
        [repoId, limit]
    );
}

/** Mark workflow runs as having their jobs fetched. Also updates duration from job data. */
export async function markJobsFetched(
    runId: number,
    accurateDuration: number | null
): Promise<void> {
    if (accurateDuration !== null) {
        await query(
            `UPDATE workflow_event SET jobs_fetched = TRUE, duration_seconds = $2 WHERE id = $1`,
            [runId, accurateDuration]
        );
    } else {
        await query(
            `UPDATE workflow_event SET jobs_fetched = TRUE WHERE id = $1`,
            [runId]
        );
    }
}
