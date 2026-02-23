import { Hono } from "hono";
import { requireService } from "../config.ts";
import { errorResponse } from "../errors.ts";

const contributors = new Hono();

contributors.get("/api/contributors/:owner", async (c) => {
    try {
        const { service, config } = requireService();
        const { owner } = c.req.param();
        const since = c.req.query("since") || undefined;
        const until = c.req.query("until") || undefined;
        const data = await service.getContributorOverview(
            owner,
            config.ownerType,
            since,
            until
        );
        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

export { contributors };
