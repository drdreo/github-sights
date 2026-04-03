// ── Workflow Fetching ─────────────────────────────────────────────────────────

import { Octokit } from "octokit";
import { githubApiError } from "../../errors.ts";
import { guardRateLimit } from "./rate-limit.ts";

export const VALID_CONCLUSIONS = new Set([
    "success",
    "failure",
    "cancelled",
    "skipped",
    "timed_out",
    "action_required",
    "neutral",
    "stale",
    "startup_failure"
]);

/** Coerce unknown conclusion values to null so they don't violate the DB check constraint. */
/** Coerce unknown conclusion values to null so they don't violate the DB check constraint. */
export function sanitizeConclusion<T extends string = string>(
    value: string | null | undefined
): T | null {
    if (!value) return null;
    return VALID_CONCLUSIONS.has(value) ? (value as T) : null;
}

export interface GitHubWorkflowRun {
    id: number;
    workflow_name: string | null;
    workflow_path: string | null;
    actor_login: string | null;
    actor_avatar_url: string | null;
    run_number: number;
    status: "completed" | "in_progress" | "queued";
    conclusion:
        | "success"
        | "failure"
        | "cancelled"
        | "skipped"
        | "timed_out"
        | "action_required"
        | "neutral"
        | "stale"
        | "startup_failure"
        | null;
    event: string | null;
    head_branch: string | null;
    head_sha: string | null;
    display_title: string | null;
    duration_seconds: number;
    created_at: string;
    html_url: string;
}

export interface GitHubWorkflowStep {
    name: string;
    number: number;
    status: "completed" | "in_progress" | "queued";
    conclusion: "success" | "failure" | "cancelled" | "skipped" | null;
    started_at: string | null;
    completed_at: string | null;
    duration_seconds: number;
}

export interface GitHubWorkflowJob {
    id: number;
    workflow_run_id: number;
    name: string;
    status: "completed" | "in_progress" | "queued";
    conclusion:
        | "success"
        | "failure"
        | "cancelled"
        | "skipped"
        | "timed_out"
        | "action_required"
        | "neutral"
        | "stale"
        | null;
    started_at: string | null;
    completed_at: string | null;
    duration_seconds: number;
    runner_name: string | null;
    steps: GitHubWorkflowStep[];
}

/**
 * Fetch workflow runs for a repo via REST API.
 * Only fetches completed runs (duration can be computed).
 * Streams pages via onPage callback.
 */
export async function fetchWorkflowRuns(
    octokit: Octokit,
    owner: string,
    repo: string,
    options?: {
        since?: string;
        onPage?: (page: GitHubWorkflowRun[]) => Promise<void>;
    }
): Promise<GitHubWorkflowRun[]> {
    try {
        await guardRateLimit(octokit);

        const allRuns: GitHubWorkflowRun[] = [];
        let totalCount = 0;

        // Build created filter for incremental sync
        const createdFilter = options?.since ? `>=${options.since.slice(0, 10)}` : undefined;

        // deno-lint-ignore no-explicit-any
        const iterator = octokit.paginate.iterator(octokit.rest.actions.listWorkflowRunsForRepo, {
            owner,
            repo,
            status: "completed" as const,
            per_page: 100,
            ...(createdFilter ? { created: createdFilter } : {})
        });

        for await (const response of iterator) {
            await guardRateLimit(octokit);

            // deno-lint-ignore no-explicit-any
            const runs: GitHubWorkflowRun[] = (response.data as any[]).map((run: any) => {
                const startedMs = new Date(run.run_started_at ?? run.created_at).getTime();
                const updatedMs = new Date(run.updated_at).getTime();
                const durationSeconds = Math.max(0, Math.round((updatedMs - startedMs) / 1000));

                return {
                    id: run.id,
                    workflow_name: run.name ?? null,
                    workflow_path: run.path ?? null,
                    actor_login: run.actor?.login ?? null,
                    actor_avatar_url: run.actor?.avatar_url ?? null,
                    run_number: run.run_number,
                    status: run.status,
                    conclusion: sanitizeConclusion(run.conclusion),
                    event: run.event ?? null,
                    head_branch: run.head_branch ?? null,
                    head_sha: run.head_sha ?? null,
                    display_title: run.display_title ?? null,
                    duration_seconds: durationSeconds,
                    created_at: run.created_at,
                    html_url: run.html_url
                };
            });

            if (options?.onPage) {
                await options.onPage(runs);
                totalCount += runs.length;
            } else {
                allRuns.push(...runs);
            }
        }

        const count = options?.onPage ? totalCount : allRuns.length;
        console.log(
            `[github] GET workflow runs for ${owner}/${repo} → ${count} runs` +
                (options?.since ? ` (since ${options.since.split("T")[0]})` : "")
        );

        return allRuns;
    } catch (error) {
        // If Actions is not enabled for the repo, the API returns 404 — treat as empty
        // deno-lint-ignore no-explicit-any
        if ((error as any)?.status === 404 || (error as any)?.response?.status === 404) {
            console.log(`[github] ${owner}/${repo}: Actions not enabled, skipping workflows`);
            return [];
        }
        throw githubApiError(`list workflow runs for ${owner}/${repo}`, error);
    }
}

/**
 * Fetch jobs (with embedded steps) for a single workflow run.
 * Costs 1 API call per run (paginated if >100 jobs, rare).
 */
export async function fetchWorkflowJobs(
    octokit: Octokit,
    owner: string,
    repo: string,
    runId: number
): Promise<GitHubWorkflowJob[]> {
    try {
        await guardRateLimit(octokit);

        const response = await octokit.rest.actions.listJobsForWorkflowRun({
            owner,
            repo,
            run_id: runId,
            per_page: 100
        });

        // deno-lint-ignore no-explicit-any
        return (response.data.jobs as any[]).map((job: any) => {
            const startedMs = job.started_at ? new Date(job.started_at).getTime() : 0;
            const completedMs = job.completed_at ? new Date(job.completed_at).getTime() : 0;
            const jobDuration =
                startedMs && completedMs
                    ? Math.max(0, Math.round((completedMs - startedMs) / 1000))
                    : 0;

            // deno-lint-ignore no-explicit-any
            const steps: GitHubWorkflowStep[] = (job.steps ?? []).map((step: any) => {
                const stepStartMs = step.started_at ? new Date(step.started_at).getTime() : 0;
                const stepEndMs = step.completed_at ? new Date(step.completed_at).getTime() : 0;
                const stepDuration =
                    stepStartMs && stepEndMs
                        ? Math.max(0, Math.round((stepEndMs - stepStartMs) / 1000))
                        : 0;

                return {
                    name: step.name,
                    number: step.number,
                    status: step.status,
                    conclusion: sanitizeConclusion(step.conclusion),
                    started_at: step.started_at ?? null,
                    completed_at: step.completed_at ?? null,
                    duration_seconds: stepDuration
                };
            });

            return {
                id: job.id,
                workflow_run_id: runId,
                name: job.name,
                status: job.status,
                conclusion: sanitizeConclusion(job.conclusion),
                started_at: job.started_at ?? null,
                completed_at: job.completed_at ?? null,
                duration_seconds: jobDuration,
                runner_name: job.runner_name ?? null,
                steps
            };
        });
    } catch (error) {
        // deno-lint-ignore no-explicit-any
        if ((error as any)?.status === 404 || (error as any)?.response?.status === 404) {
            console.log(`[github] ${owner}/${repo}: Run ${runId} not found, skipping jobs`);
            return [];
        }
        throw githubApiError(`list jobs for ${owner}/${repo} run ${runId}`, error);
    }
}
