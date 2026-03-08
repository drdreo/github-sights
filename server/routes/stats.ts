import { Hono } from "hono";
import { requireConfig } from "../../shared/config.ts";
import { errorResponse } from "../errors.ts";
import { getOwnerSnapshot } from "../../shared/db/queries/snapshots.ts";
import { aggregateOwnerActivity } from "../../shared/db/queries/activity.ts";
import { mapOwnerSnapshotToStats, emptyOverviewStats } from "../mappers.ts";

const stats = new Hono();

// ── GET /api/stats/:owner — Aggregated overview statistics ──────────────────

stats.get("/api/stats/:owner", async (c) => {
    try {
        const { owner } = c.req.param();
        requireConfig(owner);

        const since = c.req.query("since") || undefined;
        const until = c.req.query("until") || undefined;

        // If date range is specified, aggregate from daily_activity
        if (since && until) {
            const agg = await aggregateOwnerActivity(owner, since, until);
            if (!agg) {
                return c.json(emptyOverviewStats());
            }

            // Get the full snapshot for non-time-dependent fields (streaks, language, top contributors)
            const snap = await getOwnerSnapshot(owner);
            const base = snap ? mapOwnerSnapshotToStats(snap) : emptyOverviewStats();

            // Override time-dependent counts with the date-range aggregation
            return c.json({
                ...base,
                totalCommits: agg.total_commits,
                totalAdditions: Number(agg.total_additions),
                totalDeletions: Number(agg.total_deletions),
                totalPRs: agg.total_pr_opened + agg.total_pr_merged + agg.total_pr_closed,
                openPRs: agg.total_pr_opened,
                mergedPRs: agg.total_pr_merged
            });
        }

        // All-time stats from the pre-computed snapshot
        const snap = await getOwnerSnapshot(owner);
        if (!snap) {
            return c.json(emptyOverviewStats());
        }

        return c.json(mapOwnerSnapshotToStats(snap));
    } catch (error) {
        return errorResponse(c, error);
    }
});

export { stats };
