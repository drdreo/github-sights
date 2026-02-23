import { Hono } from "hono";
import { requireService } from "../config.ts";
import { errorResponse } from "../errors.ts";

const repos = new Hono();

// ── GET /api/repos — List repositories ──────────────────────────────────────

repos.get("/api/repos", async (c) => {
    try {
        const { service, config } = requireService();
        const owner = c.req.query("owner") || config.owner;
        const data = await service.listRepos(owner, config.ownerType);
        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/repos/:owner/:repo — Single repository detail ─────────────────

repos.get("/api/repos/:owner/:repo", async (c) => {
    try {
        const { service } = requireService();
        const { owner, repo } = c.req.param();
        const data = await service.getRepo(owner, repo);
        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/commits/:owner — Bulk: all repos' commits in one call ─────────

repos.get("/api/commits/:owner", async (c) => {
    try {
        const { service, config } = requireService();
        const { owner } = c.req.param();
        const since = c.req.query("since") || undefined;
        const until = c.req.query("until") || undefined;
        const cacheOnly = c.req.query("cacheOnly") === "true";
        const data = await service.listAllCommits(owner, config.ownerType, since, until, {
            cacheOnly
        });
        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/repos/:owner/:repo/commits — Commit history ───────────────────

repos.get("/api/repos/:owner/:repo/commits", async (c) => {
    try {
        const { service } = requireService();
        const { owner, repo } = c.req.param();
        const since = c.req.query("since") || undefined;
        const until = c.req.query("until") || undefined;
        const cacheOnly = c.req.query("cacheOnly") === "true";
        const data = await service.listCommits(owner, repo, { since, until, cacheOnly });
        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/repos/:owner/:repo/pulls — Pull requests ──────────────────────

repos.get("/api/repos/:owner/:repo/pulls", async (c) => {
    try {
        const { service } = requireService();
        const { owner, repo } = c.req.param();
        const state = (c.req.query("state") as "all" | "open" | "closed") || "all";
        const data = await service.listPullRequests(owner, repo, state);
        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/repos/:owner/:repo/contributors — Contributors ────────────────

repos.get("/api/repos/:owner/:repo/contributors", async (c) => {
    try {
        const { service } = requireService();
        const { owner, repo } = c.req.param();
        const data = await service.listContributors(owner, repo);
        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

export { repos };
