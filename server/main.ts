import { Hono } from "hono";
import { cors } from "jsr:@hono/hono@^4/cors";
import { loadConfig } from "../shared/config.ts";

import { initPool } from "../shared/db/pool.ts";
import { runMigrations } from "../shared/db/schema.ts";
import { deleteExpiredSessions } from "../shared/db/queries/sessions.ts";
import { auth } from "./routes/auth.ts";
import { config } from "./routes/config.ts";
import { contributorDetail } from "./routes/contributorDetail.ts";
import "../shared/signals.ts";
import { contributors } from "./routes/contributors.ts";
import { health } from "./routes/health.ts";
import { repos } from "./routes/repos.ts";
import { stats } from "./routes/stats.ts";
import { sync } from "./routes/sync.ts";
import { sessionMiddleware } from "./middleware/session.ts";

// ── App ────────────────────────────────────────────────────────────────────────

const app = new Hono();

const allowedOrigins =
    Deno.env.get("ENVIRONMENT") === "local"
        ? ["http://localhost:5173"]
        : ["https://github-sights.bannerflow.workers.dev"];

app.use("/*", cors({ origin: allowedOrigins, credentials: true }));
app.use("/*", sessionMiddleware);

// Mount route modules
app.route("/", health);
app.route("/", auth);
app.route("/", config);
app.route("/", contributorDetail);
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

// Clean up expired sessions on startup, then periodically (every 6 hours)
deleteExpiredSessions().catch(() => {});
setInterval(() => deleteExpiredSessions().catch(() => {}), 6 * 60 * 60 * 1000);

Deno.serve({ port }, app.fetch);
