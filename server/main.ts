import { Hono } from "hono";
import { cors } from "jsr:@hono/hono@^4/cors";

import { initPool } from "./db/pool.ts";
import { runMigrations } from "./db/schema.ts";
import { loadConfig } from "./config.ts";
import { config } from "./routes/config.ts";
import { health } from "./routes/health.ts";
import { contributors } from "./routes/contributors.ts";
import { repos } from "./routes/repos.ts";
import { stats } from "./routes/stats.ts";
import { sync } from "./routes/sync.ts";

// ── App ────────────────────────────────────────────────────────────────────────

const app = new Hono();

const allowedOrigins =
    Deno.env.get("ENVIRONMENT") === "local"
        ? ["http://localhost:5173"]
        : ["https://github-sights.bannerflow.workers.dev"];

app.use("/*", cors({ origin: allowedOrigins }));

// Mount route modules
app.route("/", health);
app.route("/", config);
app.route("/", contributors);
app.route("/", repos);
app.route("/", stats);
app.route("/", sync);

// ── Start ──────────────────────────────────────────────────────────────────────

const port = parseInt(Deno.env.get("PORT") || "3001", 10);

// Initialize database, run migrations, and load persisted config before serving
const dbReady = await initPool();
if (dbReady) {
    await runMigrations();
}
await loadConfig();

Deno.serve({ port }, app.fetch);
