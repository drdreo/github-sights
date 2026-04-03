import type { Octokit } from "octokit";
import {
    getUnfetchedWorkflowRuns,
    type InsertWorkflowInput,
    type InsertWorkflowJobInput,
    insertWorkflowJobs,
    insertWorkflows,
    type InsertWorkflowStepInput,
    insertWorkflowSteps,
    markJobsFetched
} from "../../db/queries/workflows.ts";
import { type UpsertContributorInput, upsertContributors } from "../../db/queries/identity.ts";
import { advanceSyncState, getSyncState } from "../../db/queries/sync-state.ts";
import { fetchWorkflowJobs, fetchWorkflowRuns, type GitHubRepo } from "../client/index.ts";

// ── Types ────────────────────────────────────────────────────────────────────────

export interface IngestWorkflowsResult {
    repoName: string;
    repoId: number;
    inserted: number;
}

/** Max jobs-fetch API calls per repo per tick. */
const JOBS_BUDGET_PER_REPO = 50;

export interface IngestWorkflowJobsResult {
    repoName: string;
    repoId: number;
    runsFetched: number;
    jobsInserted: number;
    stepsInserted: number;
}

// ── Workflow Ingestion ────────────────────────────────────────────────────────

/**
 * Ingest workflow runs for a single repo.
 * Gap-aware: only fetches runs newer than the last sync high-water mark.
 */
export async function ingestWorkflowsForRepo(
    octokit: Octokit,
    owner: string,
    repo: GitHubRepo
): Promise<IngestWorkflowsResult> {
    const repoId = repo.id;
    const repoName = repo.name;

    // Skip if workflows were synced recently
    const wfState = await getSyncState(owner, repoId, "workflows");
    const WF_STALE_MS = 6 * 60 * 60 * 1000; // 6 hours
    if (wfState?.last_synced_at && Date.now() - wfState.last_synced_at.getTime() < WF_STALE_MS) {
        const agoMin = Math.round((Date.now() - wfState.last_synced_at.getTime()) / 60_000);
        console.log(
            `[ingest] ${owner}/${repoName}: workflows synced ${agoMin}min ago, skipping (stale after 6h)`
        );
        return { repoName, repoId, inserted: 0 };
    }

    const fetchSince = wfState?.last_synced_at
        ? new Date(wfState.last_synced_at.getTime() + 1000).toISOString()
        : undefined;

    console.log(
        `[ingest] ${owner}/${repoName}: fetching workflow runs…` +
            (fetchSince ? ` (since ${fetchSince.split("T")[0]})` : " (full)")
    );

    let totalInserted = 0;
    let totalFetched = 0;
    const seenContributors = new Map<string, UpsertContributorInput>();

    await fetchWorkflowRuns(octokit, owner, repoName, {
        since: fetchSince,
        onPage: async (page) => {
            totalFetched += page.length;

            const wfInputs: InsertWorkflowInput[] = page.map((run) => ({
                id: run.id,
                repo_id: repoId,
                workflow_name: run.workflow_name,
                workflow_path: run.workflow_path,
                actor_login: run.actor_login,
                run_number: run.run_number,
                status: run.status,
                conclusion: run.conclusion,
                event: run.event,
                head_branch: run.head_branch,
                head_sha: run.head_sha,
                display_title: run.display_title,
                duration_seconds: run.duration_seconds,
                created_at: run.created_at
            }));

            totalInserted += await insertWorkflows(wfInputs);

            // Collect actor contributors
            for (const run of page) {
                if (run.actor_login && !seenContributors.has(run.actor_login)) {
                    seenContributors.set(run.actor_login, {
                        login: run.actor_login,
                        avatar_url: run.actor_avatar_url,
                        html_url: `https://github.com/${run.actor_login}`
                    });
                }
            }
        }
    });

    if (totalFetched === 0) {
        await advanceSyncState(owner, repoId, "workflows", new Date().toISOString());
        return { repoName, repoId, inserted: 0 };
    }

    console.log(
        `[ingest] ${owner}/${repoName}: fetched ${totalFetched} workflow runs, upserting contributors…`
    );

    await upsertContributors(Array.from(seenContributors.values()));
    await advanceSyncState(owner, repoId, "workflows", new Date().toISOString());
    console.log(`[ingest] ${owner}/${repoName}: workflow ingestion complete`);

    return { repoName, repoId, inserted: totalInserted };
}

// ── Workflow Jobs Ingestion (budget-capped) ─────────────────────────────────

/**
 * Fetch jobs & steps for unfetched workflow runs in a repo.
 * Budget-capped: fetches at most JOBS_BUDGET_PER_REPO runs per call.
 * Newest runs are prioritized. Each run costs 1 API call.
 */
export async function ingestWorkflowJobsForRepo(
    octokit: Octokit,
    owner: string,
    repo: GitHubRepo
): Promise<IngestWorkflowJobsResult> {
    const repoId = repo.id;
    const repoName = repo.name;

    const unfetched = await getUnfetchedWorkflowRuns(repoId, JOBS_BUDGET_PER_REPO);
    if (unfetched.length === 0) {
        return { repoName, repoId, runsFetched: 0, jobsInserted: 0, stepsInserted: 0 };
    }

    console.log(
        `[ingest] ${owner}/${repoName}: fetching jobs for ${unfetched.length} workflow runs…`
    );

    let totalJobsInserted = 0;
    let totalStepsInserted = 0;

    for (const run of unfetched) {
        const ghJobs = await fetchWorkflowJobs(octokit, owner, repoName, run.id);

        const jobInputs: InsertWorkflowJobInput[] = ghJobs.map((j) => ({
            id: j.id,
            workflow_run_id: run.id,
            repo_id: repoId,
            name: j.name,
            status: j.status,
            conclusion: j.conclusion,
            started_at: j.started_at,
            completed_at: j.completed_at,
            duration_seconds: j.duration_seconds,
            runner_name: j.runner_name
        }));

        const stepInputs: InsertWorkflowStepInput[] = ghJobs.flatMap((j) =>
            j.steps.map((s) => ({
                job_id: j.id,
                number: s.number,
                name: s.name,
                status: s.status,
                conclusion: s.conclusion,
                started_at: s.started_at,
                completed_at: s.completed_at,
                duration_seconds: s.duration_seconds
            }))
        );

        totalJobsInserted += await insertWorkflowJobs(jobInputs);
        totalStepsInserted += await insertWorkflowSteps(stepInputs);

        // Compute accurate duration from job timing
        const completedJobs = ghJobs.filter((j) => j.started_at && j.completed_at);
        let accurateDuration: number | null = null;
        if (completedJobs.length > 0) {
            const earliest = Math.min(
                ...completedJobs.map((j) => new Date(j.started_at!).getTime())
            );
            const latest = Math.max(
                ...completedJobs.map((j) => new Date(j.completed_at!).getTime())
            );
            accurateDuration = Math.max(0, Math.round((latest - earliest) / 1000));
        }

        await markJobsFetched(run.id, accurateDuration);
    }

    console.log(
        `[ingest] ${owner}/${repoName}: jobs ingestion complete — ` +
            `${unfetched.length} runs, ${totalJobsInserted} jobs, ${totalStepsInserted} steps`
    );

    return {
        repoName,
        repoId,
        runsFetched: unfetched.length,
        jobsInserted: totalJobsInserted,
        stepsInserted: totalStepsInserted
    };
}
