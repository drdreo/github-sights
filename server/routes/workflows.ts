import { Hono } from "hono";
import { requireConfig } from "../../shared/config.ts";
import { errorResponse, notFound } from "../errors.ts";
import { getRepoByName } from "../../shared/db/queries/identity.ts";
import {
    getJobStepInsightsByRepo,
    getWorkflowsByRepo,
    getWorkflowStatsByOwner,
    getWorkflowStatsByRepo
} from "../../shared/db/queries/workflows.ts";

const workflows = new Hono();

// ── GET /api/repos/:owner/:repo/workflows — Workflow runs list ──────────────

workflows.get("/api/repos/:owner/:repo/workflows", async (c) => {
    try {
        const { owner, repo } = c.req.param();
        requireConfig(owner);

        const repoRow = await getRepoByName(owner, repo);
        if (!repoRow) throw notFound("Repository", `${owner}/${repo}`);

        const limit = parseInt(c.req.query("limit") || "100", 10);
        const offset = parseInt(c.req.query("offset") || "0", 10);

        const rows = await getWorkflowsByRepo(repoRow.id, { limit, offset });
        const data = rows.map((r) => ({
            id: r.id,
            workflowName: r.workflow_name,
            workflowPath: r.workflow_path,
            actorLogin: r.actor_login,
            runNumber: r.run_number,
            status: r.status,
            conclusion: r.conclusion,
            headBranch: r.head_branch,
            displayTitle: r.display_title,
            durationSeconds: r.duration_seconds,
            createdAt: r.created_at.toISOString()
        }));
        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/repos/:owner/:repo/workflow-stats — Per-workflow breakdown ──────

workflows.get("/api/repos/:owner/:repo/workflow-stats", async (c) => {
    try {
        const { owner, repo } = c.req.param();
        requireConfig(owner);

        const repoRow = await getRepoByName(owner, repo);
        if (!repoRow) throw notFound("Repository", `${owner}/${repo}`);

        const stats = await getWorkflowStatsByRepo(repoRow.id);
        const data = stats.map((s) => ({
            workflowName: s.workflow_name,
            workflowPath: s.workflow_path,
            totalRuns: s.total_runs,
            successCount: s.success_count,
            failureCount: s.failure_count,
            cancelledCount: s.cancelled_count,
            avgDurationSeconds: s.avg_duration_seconds,
            totalDurationSeconds: s.total_duration_seconds,
            successRate: Number(s.success_rate)
        }));
        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/repos/:owner/:repo/workflow-insights — Job & step insights ──────

workflows.get("/api/repos/:owner/:repo/workflow-insights", async (c) => {
    try {
        const { owner, repo } = c.req.param();
        requireConfig(owner);

        const repoRow = await getRepoByName(owner, repo);
        if (!repoRow) throw notFound("Repository", `${owner}/${repo}`);

        const { jobs, steps } = await getJobStepInsightsByRepo(repoRow.id);
        return c.json({
            jobs: jobs.map((j) => ({
                workflowName: j.workflow_name,
                name: j.name,
                totalRuns: j.total_runs,
                failureCount: j.failure_count,
                failureRate: Number(j.failure_rate),
                avgDurationSeconds: j.avg_duration_seconds,
                maxDurationSeconds: j.max_duration_seconds
            })),
            steps: steps.map((s) => ({
                workflowName: s.workflow_name,
                name: s.name,
                totalRuns: s.total_runs,
                failureCount: s.failure_count,
                failureRate: Number(s.failure_rate),
                avgDurationSeconds: s.avg_duration_seconds,
                maxDurationSeconds: s.max_duration_seconds
            }))
        });
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/workflow-stats/:owner — Owner-wide workflow stats ───────────────

workflows.get("/api/workflow-stats/:owner", async (c) => {
    try {
        const { owner } = c.req.param();
        requireConfig(owner);

        const since = c.req.query("since") || undefined;
        const until = c.req.query("until") || undefined;
        const stats = await getWorkflowStatsByOwner(owner, since, until);
        return c.json({
            totalRuns: stats.total_runs,
            totalDurationSeconds: stats.total_duration_seconds,
            totalMinutes: Math.round(stats.total_duration_seconds / 60),
            successRate: stats.success_rate,
            avgDurationSeconds: stats.avg_duration_seconds,
            topFailingWorkflows: stats.top_failing_workflows.map((w) => ({
                workflowName: w.workflow_name,
                repoName: w.repo_name,
                failureCount: w.failure_count
            })),
            topContributorsByMinutes: stats.top_contributors_by_minutes.map((c) => ({
                login: c.login,
                totalMinutes: Math.round(c.total_duration_seconds / 60),
                runCount: c.run_count
            }))
        });
    } catch (error) {
        return errorResponse(c, error);
    }
});

export { workflows };
