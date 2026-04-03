// ── Workflow Queries ─────────────────────────────────────────────────────────────
//
// Batch insert and query operations for workflow_event, workflow_job, and workflow_step.

import { query, transaction } from "../pool.ts";
import { buildMultiRowValues, BATCH_SIZE } from "../utils.ts";

export interface InsertWorkflowInput {
    id: number;
    repo_id: number;
    workflow_name: string | null;
    workflow_path: string | null;
    actor_login: string | null;
    run_number: number | null;
    status: "completed" | "in_progress" | "queued" | null;
    conclusion: string | null;
    event: string | null;
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
         WHERE repo_id = $1 AND status = 'completed' AND event IS DISTINCT FROM 'dynamic'
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
            COALESCE(SUM(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL), 0)::BIGINT AS total_duration_seconds,
            COALESCE(ROUND(COUNT(*) FILTER (WHERE conclusion = 'success')::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1), 0)::NUMERIC AS success_rate
         FROM workflow_event
         WHERE repo_id = $1 AND status = 'completed' AND event IS DISTINCT FROM 'dynamic'
         GROUP BY workflow_name
         ORDER BY total_runs DESC`,
        [repoId]
    );
}

/** Owner-wide workflow stats for dashboard. */
export async function getWorkflowStatsByOwner(
    ownerLogin: string,
    since?: string,
    until?: string
): Promise<{
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
    const params: (string | undefined)[] = [ownerLogin];
    let dateFilter = "";
    if (since) {
        params.push(since);
        dateFilter += ` AND we.created_at >= $${params.length}`;
    }
    if (until) {
        params.push(until);
        dateFilter += ` AND we.created_at <= $${params.length}`;
    }

    const [totalsRows, topFailing, topContributors] = await Promise.all([
        query<{
            total_runs: number;
            total_duration_seconds: number;
            success_rate: number;
            avg_duration_seconds: number;
        }>(
            `SELECT
                COUNT(*)::INTEGER AS total_runs,
                COALESCE(SUM(we.duration_seconds), 0)::BIGINT AS total_duration_seconds,
                COALESCE(ROUND(COUNT(*) FILTER (WHERE we.conclusion = 'success')::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1), 0)::NUMERIC AS success_rate,
                COALESCE(AVG(we.duration_seconds) FILTER (WHERE we.duration_seconds IS NOT NULL), 0)::INTEGER AS avg_duration_seconds
             FROM workflow_event we
             JOIN repository_meta rm ON rm.id = we.repo_id
             WHERE rm.owner_login = $1 AND we.status = 'completed' AND we.event IS DISTINCT FROM 'dynamic'${dateFilter}`,
            params
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
             WHERE rm.owner_login = $1 AND we.status = 'completed' AND we.event IS DISTINCT FROM 'dynamic' AND we.conclusion IN ('failure','timed_out')${dateFilter}
             GROUP BY we.workflow_name, rm.name
             ORDER BY failure_count DESC
             LIMIT 5`,
            params
        ),
        query<{
            login: string;
            total_duration_seconds: number;
            run_count: number;
        }>(
            `SELECT
                we.actor_login AS login,
                COALESCE(SUM(we.duration_seconds), 0)::BIGINT AS total_duration_seconds,
                COUNT(*)::INTEGER AS run_count
             FROM workflow_event we
             JOIN repository_meta rm ON rm.id = we.repo_id
             WHERE rm.owner_login = $1 AND we.status = 'completed' AND we.event IS DISTINCT FROM 'dynamic' AND we.actor_login IS NOT NULL${dateFilter}
             GROUP BY we.actor_login
             ORDER BY total_duration_seconds DESC
             LIMIT 10`,
            params
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
                String(w.id),
                String(w.repo_id),
                w.workflow_name,
                w.workflow_path,
                w.actor_login,
                w.run_number,
                w.status,
                w.conclusion,
                w.event,
                w.head_branch,
                w.head_sha,
                w.display_title,
                w.duration_seconds,
                w.created_at
            ]);
            const result = await client.query(
                `INSERT INTO workflow_event (
                    id, repo_id, workflow_name, workflow_path, actor_login,
                    run_number, status, conclusion, event, head_branch, head_sha,
                    display_title, duration_seconds, created_at
                 ) VALUES ${text}
                 ON CONFLICT (id) DO UPDATE SET event = EXCLUDED.event`,
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
                String(j.id),
                String(j.workflow_run_id),
                String(j.repo_id),
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
                String(s.job_id),
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

/** Job & step insights aggregated by workflow + name for a repo. */
export async function getJobStepInsightsByRepo(repoId: number): Promise<{
    jobs: Array<{
        workflow_name: string;
        name: string;
        total_runs: number;
        failure_count: number;
        failure_rate: number;
        avg_duration_seconds: number;
        max_duration_seconds: number;
    }>;
    steps: Array<{
        workflow_name: string;
        name: string;
        total_runs: number;
        failure_count: number;
        failure_rate: number;
        avg_duration_seconds: number;
        max_duration_seconds: number;
    }>;
}> {
    const [jobs, steps] = await Promise.all([
        query<{
            workflow_name: string;
            name: string;
            total_runs: number;
            failure_count: number;
            failure_rate: number;
            avg_duration_seconds: number;
            max_duration_seconds: number;
        }>(
            `SELECT
                COALESCE(we.workflow_name, 'Unknown') AS workflow_name,
                wj.name,
                COUNT(*)::INTEGER AS total_runs,
                COUNT(*) FILTER (WHERE wj.conclusion = 'failure')::INTEGER AS failure_count,
                COALESCE(ROUND(COUNT(*) FILTER (WHERE wj.conclusion = 'failure')::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1), 0)::NUMERIC AS failure_rate,
                COALESCE(AVG(wj.duration_seconds) FILTER (WHERE wj.duration_seconds > 0), 0)::INTEGER AS avg_duration_seconds,
                COALESCE(MAX(wj.duration_seconds), 0)::INTEGER AS max_duration_seconds
             FROM workflow_job wj
             JOIN workflow_event we ON we.id = wj.workflow_run_id
             WHERE wj.repo_id = $1 AND wj.status = 'completed'
             GROUP BY we.workflow_name, wj.name
             ORDER BY failure_count DESC, avg_duration_seconds DESC`,
            [repoId]
        ),
        query<{
            workflow_name: string;
            name: string;
            total_runs: number;
            failure_count: number;
            failure_rate: number;
            avg_duration_seconds: number;
            max_duration_seconds: number;
        }>(
            `SELECT
                COALESCE(we.workflow_name, 'Unknown') AS workflow_name,
                ws.name,
                COUNT(*)::INTEGER AS total_runs,
                COUNT(*) FILTER (WHERE ws.conclusion = 'failure')::INTEGER AS failure_count,
                COALESCE(ROUND(COUNT(*) FILTER (WHERE ws.conclusion = 'failure')::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1), 0)::NUMERIC AS failure_rate,
                COALESCE(AVG(ws.duration_seconds) FILTER (WHERE ws.duration_seconds > 0), 0)::INTEGER AS avg_duration_seconds,
                COALESCE(MAX(ws.duration_seconds), 0)::INTEGER AS max_duration_seconds
             FROM workflow_step ws
             JOIN workflow_job wj ON ws.job_id = wj.id
             JOIN workflow_event we ON we.id = wj.workflow_run_id
             WHERE wj.repo_id = $1 AND ws.status = 'completed'
             GROUP BY we.workflow_name, ws.name
             ORDER BY failure_count DESC, avg_duration_seconds DESC`,
            [repoId]
        )
    ]);

    return { jobs, steps };
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
            [String(runId), accurateDuration]
        );
    } else {
        await query(`UPDATE workflow_event SET jobs_fetched = TRUE WHERE id = $1`, [String(runId)]);
    }
}
