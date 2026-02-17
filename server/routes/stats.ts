import { Hono } from "hono";
import { requireService } from "../config.ts";
import { errorResponse } from "../errors.ts";

const stats = new Hono();

// ── GET /api/stats/:owner — Aggregated overview statistics ──────────────────

stats.get("/api/stats/:owner", async (c) => {
  try {
    const { service, config } = requireService();
    const { owner } = c.req.param();
    const since = c.req.query("since") || undefined;
    const until = c.req.query("until") || undefined;
    const cacheOnly = c.req.query("cacheOnly") === "true";
    const data = await service.getOverviewStats(
      owner,
      config.ownerType,
      since,
      until,
      { cacheOnly },
    );
    return c.json(data);
  } catch (error) {
    return errorResponse(c, error);
  }
});

export { stats };
