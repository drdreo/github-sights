import { Hono } from "hono";
import { clearConfig, getConfig } from "../../shared/config.ts";
import { errorResponse, notConfigured } from "../errors.ts";
import { requireAuth } from "../middleware/session.ts";
import { deleteOwnerData } from "../../shared/db/queries/identity.ts";
import { updateSyncSince } from "../../shared/db/queries/config.ts";
import {
    syncOwner,
    syncRepo,
    ensureFresh,
    getProgress,
    isSyncing,
    abortSync
} from "../../shared/scraper/index.ts";
import { aggregateOwner } from "../../shared/scraper/aggregate.ts";

const sync = new Hono();

// ── POST /api/sync/:owner — Enqueue full sync pipeline ──────────────────────
//
// Query params (optional):
//   since — ISO date string (only when explicitly provided, e.g. initial sync)
//   until — ISO date string (only when explicitly provided)
sync.post("/api/sync/:owner", requireAuth, async (c) => {
    try {
        const { owner } = c.req.param();

        // Ensure owner config exists (populated during OAuth callback)
        if (!getConfig(owner)) throw notConfigured();

        const since = c.req.query("since") || undefined;
        const until = c.req.query("until") || undefined;

        // Persist sync_since when explicitly provided
        if (since) {
            await updateSyncSince(owner, since);
        }

        // Explicit backfill (since/until provided): always enqueue
        if (since || until) {
            const result = await syncOwner(owner, { since, until });

            return c.json({
                enqueued: result.enqueued,
                jobId: result.jobId,
                alreadyRunning: result.alreadyRunning
            });
        }

        const triggered = await ensureFresh(owner);

        return c.json({ triggered });
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── POST /api/sync/:owner/:repo — Enqueue single repo sync ──────────────────
//
// Fetches commits + PRs for a specific repo and rebuilds its snapshot.
// Used by repo detail pages to trigger on-demand deep sync.
sync.post("/api/sync/:owner/:repo", requireAuth, async (c) => {
    try {
        const { owner, repo } = c.req.param();

        // Ensure owner config exists (populated during OAuth callback)
        if (!getConfig(owner)) throw notConfigured();

        const result = await syncRepo(owner, repo);

        return c.json({
            enqueued: result.enqueued,
            jobId: result.jobId,
            alreadyRunning: result.alreadyRunning
        });
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/sync/progress/:owner — Poll sync progress ──────────────────────
sync.get("/api/sync/progress/:owner", async (c) => {
    const { owner } = c.req.param();
    const progress = await getProgress(owner);
    return c.json(progress);
});

// ── POST /api/aggregate/:owner — Re-aggregate snapshots from existing events ──
//
// Rebuilds all snapshots + daily_activity without re-fetching from GitHub.
// Useful after changing aggregation logic.
sync.post("/api/aggregate/:owner", requireAuth, async (c) => {
    try {
        const { owner } = c.req.param();

        if (!getConfig(owner)) throw notConfigured();

        const result = await aggregateOwner(owner);
        return c.json(result);
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── DELETE /api/owner/:owner — Purge all owner data (GDPR / reset) ───────────
sync.delete("/api/owner/:owner", requireAuth, async (c) => {
    try {
        const { owner } = c.req.param();

        // Cancel any active sync before deleting to avoid FK violations
        if (await isSyncing(owner)) {
            await abortSync(owner);
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
