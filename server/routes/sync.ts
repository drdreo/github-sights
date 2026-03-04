import { Hono } from "hono";
import { requireConfig } from "../config.ts";
import { errorResponse } from "../errors.ts";
import { syncOwner, syncRepo, getProgress } from "../scraper/index.ts";

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
        const mode = (c.req.query("mode") as "shallow" | "deep" | undefined) || undefined;
        const result = await syncOwner(owner, config.token, config.ownerType, { since, until, mode });

        // Return only the client-expected shape (strip aggregation + durationMs)
        return c.json({
            synced: result.synced,
            repos: result.repos,
            errors: result.errors,
        });
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

export { sync };
