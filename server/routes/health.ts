import { Hono } from "hono";
import { commitCache } from "../cache.ts";

const health = new Hono();

health.get("/api/health", (c) => {
    const cacheStats = commitCache.stats();
    return c.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: Math.floor(performance.now() / 1000),
        cache: {
            cachedRepos: cacheStats.repos,
            cachedCommits: cacheStats.totalCommits
        }
    });
});

export { health };
