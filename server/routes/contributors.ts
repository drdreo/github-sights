import { Hono } from "hono";
import { requireConfig } from "../../shared/config.ts";
import { errorResponse } from "../errors.ts";
import { getContributorSnapshotsByOwner } from "../../shared/db/queries/snapshots.ts";
import { aggregateContributorActivity } from "../../shared/db/queries/activity.ts";
import { getOwner } from "../../shared/db/queries/identity.ts";
import { mapContribSnapshotToOverview } from "../mappers.ts";
import type { ContributorOverview } from "../types.ts";

const contributors = new Hono();

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

export { contributors };
