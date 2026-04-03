import { Hono } from "hono";
import { requireConfig } from "../../shared/config.ts";
import { errorResponse, notFound } from "../errors.ts";
import { getOwner, getRepoByName, getReposByOwner } from "../../shared/db/queries/identity.ts";
import { getRepoSnapshotsByOwner } from "../../shared/db/queries/snapshots.ts";
import { mapRepoRow } from "../mappers/index.ts";
import { syncRepo } from "../../shared/scraper/index.ts";

const repos = new Hono();

// ── GET /api/repos — List repositories ──────────────────────────────────────

repos.get("/api/repos/:owner", async (c) => {
    try {
        const { owner } = c.req.param();
        requireConfig(owner);

        const ownerRow = await getOwner(owner);
        const ownerInfo = {
            login: ownerRow?.login ?? owner,
            avatar_url: ownerRow?.avatar_url ?? "",
            html_url: ownerRow?.html_url ?? `https://github.com/${owner}`
        };

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

export { repos };
