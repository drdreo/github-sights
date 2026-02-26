import { Hono } from "hono";
import { requireService } from "../config.ts";
import { errorResponse } from "../errors.ts";

const contributors = new Hono();

contributors.get("/api/contributors/:owner", async (c) => {
    try {
        const { owner } = c.req.param();
        const { service, config } = requireService(owner);
        const since = c.req.query("since") || undefined;
        const until = c.req.query("until") || undefined;
        const { data, fetchedAt } = await service.getContributorOverview(owner, config.ownerType, since, until);
        return c.json({ data, fetchedAt });
    } catch (error) {
        return errorResponse(c, error);
    }
});

export { contributors };
