import { Hono } from "hono";
import { requireConfig } from "../config.ts";
import { errorResponse } from "../errors.ts";
import { syncOwner } from "../scraper/index.ts";

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
        const result = await syncOwner(owner, config.token, config.ownerType, { since, until });

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

export { sync };
