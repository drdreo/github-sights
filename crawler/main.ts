// ── Crawler Service ─────────────────────────────────────────────────────────
//
// HTTP-based crawler that scales to zero on Railway.
// Exposes a /wake endpoint that the API server calls when new jobs are enqueued.
// Processes all pending jobs, then goes idle (Railway scales to zero).

import { Hono } from "hono";
import { initPool } from "../shared/db/pool.ts";
import { runMigrations } from "../shared/db/schema.ts";
import { loadConfig } from "../shared/config.ts";
import { tick, cleanup } from "../shared/scraper/index.ts";
import "../shared/signals.ts";

// ── Config ──────────────────────────────────────────────────────────────────

const port = parseInt(Deno.env.get("PORT") || "3002", 10);

// ── State ───────────────────────────────────────────────────────────────────

/** Whether a drain loop is currently running. Prevents duplicate concurrent drains. */
let draining = false;

// ── Startup ─────────────────────────────────────────────────────────────────

console.log("[crawler] Starting crawler service...");

const dbReady = await initPool();
if (!dbReady) {
    console.error("[crawler] DATABASE_URL not set — cannot run without database. Exiting.");
    Deno.exit(1);
}

await runMigrations();
await loadConfig();

// ── Drain Loop ──────────────────────────────────────────────────────────────

/**
 * Process all pending jobs until the queue is empty.
 * Called on /wake — runs in the background so the HTTP response returns immediately.
 * The `draining` flag prevents overlapping drains if /wake is called multiple times.
 */
async function drain(): Promise<void> {
    if (draining) {
        console.log("[crawler] Already draining, skipping");
        return;
    }

    draining = true;
    console.log("[crawler] Drain started");

    try {
        let tickCount = 0;
        while (true) {
            await loadConfig();
            const hasMore = await tick();
            tickCount++;

            if (!hasMore) {
                console.log(`[crawler] Queue drained after ${tickCount} tick(s)`);
                break;
            }
        }
    } catch (err) {
        console.error("[crawler] Drain failed:", err);
    } finally {
        draining = false;
    }
}

// ── HTTP Server ─────────────────────────────────────────────────────────────

const app = new Hono();

/** Health check — Railway uses this to know the service is alive. */
app.get("/health", (c) => c.json({ status: "ok", draining }));

/**
 * Wake endpoint — called by the API server when a job is enqueued.
 * Kicks off the drain loop in the background and returns immediately.
 */
app.post("/wake", (c) => {
    // Fire-and-forget — don't await, let the HTTP response return fast
    void drain();
    return c.json({ woken: true, alreadyDraining: draining });
});

/**
 * Manual cleanup endpoint — can also be triggered via Railway cron or external scheduler.
 */
app.post("/cleanup", async (c) => {
    try {
        await cleanup();
        return c.json({ cleaned: true });
    } catch (err) {
        console.error("[crawler] Cleanup failed:", err);
        return c.json({ error: String(err) }, 500);
    }
});

// ── Start ───────────────────────────────────────────────────────────────────

console.log(`[crawler] Ready. Listening on port ${port}`);

// Drain any leftover jobs from before a restart
void drain();

Deno.serve({ port }, app.fetch);