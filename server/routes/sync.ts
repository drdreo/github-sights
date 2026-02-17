import { Hono } from "hono";
import { requireService } from "../config.ts";
import { errorResponse } from "../errors.ts";

const sync = new Hono();

// ── POST /api/sync — Trigger background gap-filling ────────────────────────
//
// The frontend calls this after rendering cached data.
// It fills commit gaps for all non-fork repos (last fetch → now)
// and returns a summary when done.
//
// Query params:
//   since — ISO date string (defaults to 30 days ago)
//   until — ISO date string (defaults to now)

sync.post("/api/sync", async (c) => {
  try {
    const { service, config } = requireService();
    const since =
      c.req.query("since") ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const until = c.req.query("until") || undefined;

    const result = await service.syncCommits(
      config.owner,
      config.ownerType,
      since,
      until,
    );

    return c.json(result);
  } catch (error) {
    return errorResponse(c, error);
  }
});

export { sync };
