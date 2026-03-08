import { Hono } from "hono";
import { poolStats, isPoolAvailable } from "../../shared/db/pool.ts";

const health = new Hono();

health.get("/api/health", (c) => {
    const dbStats = isPoolAvailable() ? poolStats() : null;

    return c.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: Math.floor(performance.now() / 1000),
        db: dbStats
            ? {
                  connected: true,
                  totalConnections: dbStats.totalCount,
                  idleConnections: dbStats.idleCount,
                  waitingClients: dbStats.waitingCount
              }
            : { connected: false }
    });
});

export { health };
