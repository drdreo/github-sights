import { Hono } from "hono";
import { requireConfig } from "../../shared/config.ts";
import { errorResponse, notFound } from "../errors.ts";
import { getRepoByName } from "../../shared/db/queries/identity.ts";
import { getPrsByRepo } from "../../shared/db/queries/pulls.ts";
import { mapPrRow } from "../mappers/index.ts";

const pulls = new Hono();

// ── GET /api/repos/:owner/:repo/pulls — Pull requests ──────────────────────

pulls.get("/api/repos/:owner/:repo/pulls", async (c) => {
    try {
        const { owner, repo } = c.req.param();
        requireConfig(owner);

        const repoRow = await getRepoByName(owner, repo);
        if (!repoRow) throw notFound("Repository", `${owner}/${repo}`);

        const state = (c.req.query("state") as "all" | "open" | "closed") || "all";
        const rows = await getPrsByRepo(repoRow.id, { state });
        const data = rows.map((r) => mapPrRow(r));
        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

export { pulls };
