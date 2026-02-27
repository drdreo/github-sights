import { Hono } from "hono";
import { requireConfig } from "../config.ts";
import { errorResponse } from "../errors.ts";
import { getContributorSnapshotsByOwner } from "../db/queries/snapshots.ts";
import { getOwner } from "../db/queries/identity.ts";
import { mapContribSnapshotToOverview } from "../mappers.ts";

const contributors = new Hono();

contributors.get("/api/contributors/:owner", async (c) => {
    try {
        const { owner } = c.req.param();
        requireConfig(owner);

        const rows = await getContributorSnapshotsByOwner(owner);
        const data = rows.map(mapContribSnapshotToOverview);

        const ownerRow = await getOwner(owner);
        const fetchedAt = ownerRow?.last_synced_at ?? new Date().toISOString();

        return c.json({ data, fetchedAt });
    } catch (error) {
        return errorResponse(c, error);
    }
});

export { contributors };
