import { Hono } from "hono";
import { requireConfig } from "../../shared/config.ts";
import { errorResponse, notFound } from "../errors.ts";
import { getOwner, getRepoByName, getReposByOwner } from "../../shared/db/queries/identity.ts";
import {
    getCommitsByOwner,
    getCommitsByRepo,
    getContributorStatsByRepo,
    getPrsByRepo,
    getWorkflowsByRepo,
    getWorkflowStatsByOwner,
    getWorkflowStatsByRepo
} from "../../shared/db/queries/events.ts";
import {
    getContributorSnapshotsByRepo,
    getRepoSnapshotsByOwner
} from "../../shared/db/queries/snapshots.ts";
import { mapCommitRow, mapContribSnapshotToContributor, mapPrRow, mapRepoRow } from "../mappers.ts";
import type { RepositoryMetaRow } from "../../shared/db/index.ts";
import { syncRepo } from "../../shared/scraper/index.ts";

const repos = new Hono();

// ── GET /api/repos — List repositories ──────────────────────────────────────

repos.get("/api/repos/:owner", async (c) => {
    try {
        const { owner } = c.req.param();
        requireConfig(owner);

        const ownerRow = await getOwner(owner);
        const ownerInfo = ownerRow
            ? {
                  login: ownerRow.login,
                  avatar_url: ownerRow.avatar_url ?? "",
                  html_url: ownerRow.html_url ?? `https://github.com/${ownerRow.login}`
              }
            : undefined;

        const rows = await getReposByOwner(owner);
        const data = rows.map((r) => mapRepoRow(r, ownerInfo));

        return c.json({ data, fetchedAt: ownerRow?.last_synced_at ?? new Date().toISOString() });
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/repos/:owner/:repo — Single repository detail ─────────────────

repos.get("/api/repos/:owner/:repo", async (c) => {
    try {
        const { owner, repo } = c.req.param();
        requireConfig(owner);

        // Fire-and-forget: enqueue deep sync (commits + PRs) for this repo
        syncRepo(owner, repo).catch((e) => {
            console.error(`[sync] Failed to enqueue deep sync for ${owner}/${repo}:`, e);
        });

        const repoRow = await getRepoByName(owner, repo);
        if (!repoRow) {
            throw notFound("Repository", `${owner}/${repo}`);
        }

        const ownerRow = await getOwner(owner);
        if (!ownerRow) {
            throw new Error(`Owner ${owner} not found`);
        }
        const ownerInfo = {
            login: ownerRow.login,
            avatar_url: ownerRow.avatar_url ?? "",
            html_url: ownerRow.html_url ?? `https://github.com/${ownerRow.login}`
        };

        return c.json(mapRepoRow(repoRow, ownerInfo));
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/commits/:owner — Bulk: all repos' commits in one call ─────────

repos.get("/api/commits/:owner", async (c) => {
    try {
        const { owner } = c.req.param();
        requireConfig(owner);

        const since = c.req.query("since") || undefined;
        const until = c.req.query("until") || undefined;

        // Get all repos for this owner (needed to group commits and provide Repository objects)
        const ownerRow = await getOwner(owner);
        const ownerInfo = ownerRow
            ? {
                  login: ownerRow.login,
                  avatar_url: ownerRow.avatar_url ?? "",
                  html_url: ownerRow.html_url ?? `https://github.com/${ownerRow.login}`
              }
            : undefined;

        const repoRows = await getReposByOwner(owner);
        const repoById = new Map<number, RepositoryMetaRow>();
        for (const r of repoRows) {
            repoById.set(r.id, r);
        }

        // Get all commits across all repos
        const commitRows = await getCommitsByOwner(owner, { since, until });

        // Group commits by repo_id
        const commitsByRepoId = new Map<number, typeof commitRows>();
        for (const commit of commitRows) {
            let group = commitsByRepoId.get(commit.repo_id);
            if (!group) {
                group = [];
                commitsByRepoId.set(commit.repo_id, group);
            }
            group.push(commit);
        }

        // Build response: Array<{ repo: Repository, commits: Commit[] }>
        const data = repoRows
            .filter((r) => commitsByRepoId.has(r.id))
            .map((r) => ({
                repo: mapRepoRow(r, ownerInfo),
                commits: (commitsByRepoId.get(r.id) ?? []).map((c) => mapCommitRow(c, r.name))
            }));

        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/repos/:owner/:repo/commits — Commit history ───────────────────

repos.get("/api/repos/:owner/:repo/commits", async (c) => {
    try {
        const { owner, repo } = c.req.param();
        requireConfig(owner);

        const repoRow = await getRepoByName(owner, repo);
        if (!repoRow) throw notFound("Repository", `${owner}/${repo}`);

        const since = c.req.query("since") || undefined;
        const until = c.req.query("until") || undefined;

        const rows = await getCommitsByRepo(repoRow.id, { since, until });
        const data = rows.map((r) => mapCommitRow(r, repo));
        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/repos/:owner/:repo/pulls — Pull requests ──────────────────────

repos.get("/api/repos/:owner/:repo/pulls", async (c) => {
    try {
        const { owner, repo } = c.req.param();
        requireConfig(owner);

        const repoRow = await getRepoByName(owner, repo);
        if (!repoRow) throw notFound("Repository", `${owner}/${repo}`);

        const state = (c.req.query("state") as "all" | "open" | "closed") || "all";
        const rows = await getPrsByRepo(repoRow.id, { state });
        const data = rows.map((r) => mapPrRow(r));
        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/repos/:owner/:repo/contributors — Contributors ────────────────

repos.get("/api/repos/:owner/:repo/contributors", async (c) => {
    try {
        const { owner, repo } = c.req.param();
        requireConfig(owner);

        const rows = await getContributorSnapshotsByRepo(owner, repo);
        const data = rows.map(mapContribSnapshotToContributor);
        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/repos/:owner/:repo/contributor-stats — Per-repo contributor stats with LOC ──

repos.get("/api/repos/:owner/:repo/contributor-stats", async (c) => {
    try {
        const { owner, repo } = c.req.param();
        requireConfig(owner);

        const repoRow = await getRepoByName(owner, repo);
        if (!repoRow) throw notFound("Repository", `${owner}/${repo}`);

        const stats = await getContributorStatsByRepo(repoRow.id);

        // Map to the expected shape with contributor profile info
        const aggregated = stats
            .filter((s) => s.commits > 0)
            .map((s) => ({
                login: s.login,
                avatar_url: s.avatar_url ?? "",
                html_url: `https://github.com/${s.login}`,
                totalCommits: s.commits,
                totalAdditions: s.additions,
                totalDeletions: s.deletions
            }))
            .sort((a, b) => b.totalCommits - a.totalCommits);

        return c.json(aggregated);
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/repo-snapshots/:owner — Bulk repo snapshots (PRs, LoC, CI) ─────

repos.get("/api/repo-snapshots/:owner", async (c) => {
    try {
        const { owner } = c.req.param();
        requireConfig(owner);

        const rows = await getRepoSnapshotsByOwner(owner);
        const data = rows.map((r) => ({
            name: r.name,
            totalPRs: r.total_prs,
            openPRs: r.open_prs,
            mergedPRs: r.merged_prs,
            totalAdditions: r.total_additions,
            totalDeletions: r.total_deletions,
            ciSuccessRate: r.ci_success_rate,
            ciAvgDurationSeconds: r.ci_avg_duration_seconds,
            lastCiConclusion: r.last_ci_conclusion
        }));
        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/repos/:owner/:repo/workflows — Workflow runs list ──────────────

repos.get("/api/repos/:owner/:repo/workflows", async (c) => {
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
            durationSeconds: r.duration_seconds,
            createdAt: r.created_at.toISOString()
        }));
        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/repos/:owner/:repo/workflow-stats — Per-workflow breakdown ──────

repos.get("/api/repos/:owner/:repo/workflow-stats", async (c) => {
    try {
        const { owner, repo } = c.req.param();
        requireConfig(owner);

        const repoRow = await getRepoByName(owner, repo);
        if (!repoRow) throw notFound("Repository", `${owner}/${repo}`);

        const stats = await getWorkflowStatsByRepo(repoRow.id);
        const data = stats.map((s) => ({
            workflowName: s.workflow_name,
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

// ── GET /api/workflow-stats/:owner — Owner-wide workflow stats ───────────────

repos.get("/api/workflow-stats/:owner", async (c) => {
    try {
        const { owner } = c.req.param();
        requireConfig(owner);

        const stats = await getWorkflowStatsByOwner(owner);
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

export { repos };
