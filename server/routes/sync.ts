import { Hono } from "hono";
import { clearConfig } from "../config.ts";
import { requireConfig } from "../config.ts";
import { errorResponse } from "../errors.ts";
import { deleteOwnerData } from "../db/queries/identity.ts";
import { updateSyncSince } from "../db/queries/config.ts";
import { syncOwner, syncRepo, ensureFresh, getProgress, isSyncing, abortInflight } from "../scraper/index.ts";
import { aggregateOwner } from "../scraper/aggregate.ts";

const sync = new Hono();

// ── POST /api/sync — Trigger full sync pipeline ────────────────────────────
//
// Query params (optional):
//   since — ISO date string (only when explicitly provided, e.g. initial sync)
//   until — ISO date string (only when explicitly provided)
sync.post("/api/sync/:owner", async (c) => {
    try {
        const { owner } = c.req.param();
        const config = requireConfig(owner);
        const since = c.req.query("since") || undefined;
        const until = c.req.query("until") || undefined;

        // Persist sync_since when explicitly provided
        if (since) {
            await updateSyncSince(owner, since);
        }

        // Explicit backfill (since/until provided): always run full sync
        if (since || until) {
            const result = await syncOwner(owner, config.token, config.ownerType, { since, until });
            return c.json({
                synced: result.synced,
                repos: result.repos,
                errors: result.errors,
            });
        }

        // Normal dashboard sync: debounce to once per hour
        const ONE_HOUR = 60 * 60 * 1000;
        const triggered = await ensureFresh(owner, config.token, config.ownerType, ONE_HOUR);

        return c.json({ triggered });
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── POST /api/sync/:owner/:repo — Deep-sync a single repo ───────────────────
//
// Fetches commits + PRs for a specific repo and rebuilds its snapshot.
// Used by repo detail pages to trigger on-demand deep sync.
sync.post("/api/sync/:owner/:repo", async (c) => {
    try {
        const { owner, repo } = c.req.param();
        const config = requireConfig(owner);
        const result = await syncRepo(owner, repo, config.token, config.ownerType);

        return c.json({
            repo: result.repo,
            commits: result.commits,
            prs: result.prs,
            errors: result.errors,
        });
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/sync/progress/:owner — Poll sync progress ──────────────────────
sync.get("/api/sync/progress/:owner", (c) => {
    const { owner } = c.req.param();
    const progress = getProgress(owner);
    if (!progress) {
        return c.json({ active: false });
    }
    return c.json({
        active: true,
        status: progress.status,
        totalRepos: progress.totalRepos,
        syncedRepos: progress.syncedRepos,
        currentRepo: progress.currentRepo,
        totalEvents: progress.totalEvents,
        elapsedMs: Date.now() - progress.startedAt,
    });
});

// ── POST /api/aggregate/:owner — Re-aggregate snapshots from existing events ──
//
// Rebuilds all snapshots + daily_activity without re-fetching from GitHub.
// Useful after changing aggregation logic.
sync.post("/api/aggregate/:owner", async (c) => {
    try {
        const { owner } = c.req.param();
        requireConfig(owner);

        const result = await aggregateOwner(owner);
        return c.json(result);
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── DELETE /api/owner/:owner — Purge all owner data (GDPR / reset) ───────────
sync.delete("/api/owner/:owner", async (c) => {
    try {
        const { owner } = c.req.param();

        // Abort any in-flight sync before deleting to avoid FK violations
        if (isSyncing(owner)) {
            await abortInflight(owner);
        }

        const deleted = await deleteOwnerData(owner);
        if (!deleted) {
            return c.json({ error: "Owner not found" }, 404);
        }
        await clearConfig(owner);
        return c.json({ deleted: true, owner });
    } catch (error) {
        return errorResponse(c, error);
    }
});

export { sync };
