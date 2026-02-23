import { Hono } from "hono";
import { cors } from "jsr:@hono/hono@^4/cors";

import { loadConfig } from "./config.ts";
import { initDb } from "./db.ts";
import { config } from "./routes/config.ts";
import { health } from "./routes/health.ts";
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
app.route("/", repos);
app.route("/", stats);
app.route("/", sync);

// ── Start ──────────────────────────────────────────────────────────────────────

const port = parseInt(Deno.env.get("PORT") || "3001", 10);

// Initialize database and load persisted config before serving
await initDb();
await loadConfig();

Deno.serve({ port }, app.fetch);
