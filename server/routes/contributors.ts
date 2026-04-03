import { Hono } from "hono";
import { requireConfig } from "../../shared/config.ts";
import { errorResponse, notFound } from "../errors.ts";
import {
    getContributorSnapshotsByOwner,
    getContributorSnapshotsByRepo
} from "../../shared/db/queries/snapshots.ts";
import { aggregateContributorActivity } from "../../shared/db/queries/activity.ts";
import { getOwner, getRepoByName } from "../../shared/db/queries/identity.ts";
import { getContributorStatsByRepo } from "../../shared/db/queries/commits.ts";
import { mapContribSnapshotToContributor, mapContribSnapshotToOverview } from "../mappers/index.ts";
import type { ContributorOverview } from "../types.ts";

const contributors = new Hono();

// ── GET /api/contributors/:owner — Owner-level contributor list ─────────────

contributors.get("/api/contributors/:owner", async (c) => {
    try {
        const { owner } = c.req.param();
        requireConfig(owner);

        const since = c.req.query("since");
        const until = c.req.query("until");

        let data: ContributorOverview[];

        if (since && until) {
            const rows = await aggregateContributorActivity(owner, since, until);
            data = rows.map((r) => ({
                login: r.login,
                avatar_url: r.avatar_url ?? "",
                html_url: r.html_url ?? `https://github.com/${r.login}`,
                totalCommits: r.total_commits,
                totalAdditions: r.total_additions,
                totalDeletions: r.total_deletions,
                totalPRs: r.total_prs,
                repos: r.repos ?? []
            }));
        } else {
            const rows = await getContributorSnapshotsByOwner(owner);
            data = rows.map(mapContribSnapshotToOverview);
        }

        const ownerRow = await getOwner(owner);
        const fetchedAt = ownerRow?.last_synced_at ?? new Date().toISOString();

        return c.json({ data, fetchedAt });
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/repos/:owner/:repo/contributors — Per-repo contributors ────────

contributors.get("/api/repos/:owner/:repo/contributors", async (c) => {
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

contributors.get("/api/repos/:owner/:repo/contributor-stats", async (c) => {
    try {
        const { owner, repo } = c.req.param();
        requireConfig(owner);

        const repoRow = await getRepoByName(owner, repo);
        if (!repoRow) throw notFound("Repository", `${owner}/${repo}`);

        const stats = await getContributorStatsByRepo(repoRow.id);

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

export { contributors };
