// ── Crawler Service ─────────────────────────────────────────────────────────
//
// Replaces Deno.cron with a persistent polling loop.
// Processes sync_job queue tick-by-tick, runs cleanup daily.
// Shares the same Postgres DB as the API server.

import { initPool } from "../shared/db/pool.ts";
import { runMigrations } from "../shared/db/schema.ts";
import { loadConfig } from "../shared/config.ts";
import { tick, cleanup } from "../shared/scraper/index.ts";
import "../shared/signals.ts";

// ── Config ──────────────────────────────────────────────────────────────────

/** How often to poll for new jobs (ms). */
const POLL_INTERVAL_MS = parseInt(Deno.env.get("POLL_INTERVAL_MS") || "10000", 10);

/** How often to run cleanup of old jobs (ms). Default: 24 hours. */
const CLEANUP_INTERVAL_MS = parseInt(Deno.env.get("CLEANUP_INTERVAL_MS") || "86400000", 10);

// ── Startup ─────────────────────────────────────────────────────────────────

console.log("[crawler] Starting crawler service...");

const dbReady = await initPool();
if (!dbReady) {
    console.error("[crawler] DATABASE_URL not set — cannot run without database. Exiting.");
    Deno.exit(1);
}

await runMigrations();
await loadConfig();

console.log(`[crawler] Ready. Polling every ${POLL_INTERVAL_MS / 1000}s`);

// ── Poll Loop ───────────────────────────────────────────────────────────────

let running = true;

async function pollLoop(): Promise<void> {
    while (running) {
        try {
            // Refresh config each tick (new owners may have been added via API)
            await loadConfig();
            await tick();
        } catch (err) {
            console.error("[crawler] Tick failed:", err);
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
}

// ── Cleanup Loop ────────────────────────────────────────────────────────────

async function cleanupLoop(): Promise<void> {
    while (running) {
        await new Promise((resolve) => setTimeout(resolve, CLEANUP_INTERVAL_MS));

        try {
            await cleanup();
        } catch (err) {
            console.error("[crawler] Cleanup failed:", err);
        }
    }
}

// ── Graceful Shutdown ───────────────────────────────────────────────────────

for (const signal of ["SIGINT", "SIGTERM"] as Deno.Signal[]) {
    try {
        Deno.addSignalListener(signal, () => {
            console.log(`[crawler] Received ${signal}, shutting down...`);
            running = false;
        });
    } catch {
        // Signal listeners may not be supported on all platforms
    }
}

// Start both loops concurrently
await Promise.all([pollLoop(), cleanupLoop()]);

console.log("[crawler] Stopped.");
