// ── Sync Queue Cron ─────────────────────────────────────────────────────────
//
// Process sync jobs tick-by-tick. Each cron invocation gets a fresh isolate,
// does bounded work (a few repos), then exits. Crash-safe: state is in Postgres.

import { loadConfig } from "./config.ts";
import { cleanup, tick } from "./scraper/index.ts";

Deno.cron("sync-queue-tick", "* * * * *", async () => {
    try {
        await loadConfig(); // Refresh config each tick (isolate may be fresh)
        await tick();
    } catch (err) {
        console.error("[cron] sync-queue-tick failed:", err);
    }
});

// Clean up old completed/failed jobs daily at 3:00 AM UTC
Deno.cron("sync-queue-cleanup", "0 3 * * *", async () => {
    try {
        await cleanup();
    } catch (err) {
        console.error("[cron] sync-queue-cleanup failed:", err);
    }
});
