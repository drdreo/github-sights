// ── On-Demand Workflow Job Ingestion ────────────────────────────────────────
//
// Fetching workflow jobs costs one GitHub API call per run, so it is deliberately
// kept out of the bulk owner sync. Instead we fetch lazily: when a user actually
// views a repo's workflow data, we drain its unfetched runs in the background.
// This backfills accurate per-run durations (from job timings) and the job/step
// insight tables, converging over repeated views (budget-capped per call).

import { getConfig } from "../config.ts";
import { createOctokit } from "./client/index.ts";
import { ingestWorkflowJobsForRepo } from "./ingest/workflows.ts";

/** Repos with an in-flight job fetch — prevents duplicate concurrent drains. */
const inFlight = new Set<number>();

/**
 * Fire-and-forget: lazily fetch workflow jobs for a repo when its workflow data
 * is viewed. Deduped per repo; returns immediately. Accurate durations land in
 * the DB for the next poll/refresh. No-op once all runs have been fetched.
 */
export function ensureWorkflowJobs(owner: string, repo: { id: number; name: string }): void {
    if (inFlight.has(repo.id)) return;

    const config = getConfig(owner);
    if (!config?.token) return;

    inFlight.add(repo.id);
    const octokit = createOctokit(config.token);

    ingestWorkflowJobsForRepo(octokit, owner, repo)
        .catch((err) =>
            console.warn(`[jobs] on-demand fetch failed for ${owner}/${repo.name}:`, err)
        )
        .finally(() => inFlight.delete(repo.id));
}
