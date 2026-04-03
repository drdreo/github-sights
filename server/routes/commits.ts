import { Hono } from "hono";
import { requireConfig } from "../../shared/config.ts";
import { errorResponse } from "../errors.ts";
import { getOwner, getRepoByName, getReposByOwner } from "../../shared/db/queries/identity.ts";
import { getCommitsByOwner, getCommitsByRepo } from "../../shared/db/queries/commits.ts";
import { mapCommitRow } from "../mappers/index.ts";
import { mapRepoRow } from "../mappers/index.ts";
import type { RepositoryMetaRow } from "../../shared/db/index.ts";

const commits = new Hono();

// ── GET /api/commits/:owner — Bulk: all repos' commits in one call ─────────

commits.get("/api/commits/:owner", async (c) => {
    try {
        const { owner } = c.req.param();
        requireConfig(owner);

        const since = c.req.query("since") || undefined;
        const until = c.req.query("until") || undefined;

        const ownerRow = await getOwner(owner);
        const ownerInfo = {
            login: ownerRow?.login ?? owner,
            avatar_url: ownerRow?.avatar_url ?? "",
            html_url: ownerRow?.html_url ?? `https://github.com/${owner}`
        };

        const repoRows = await getReposByOwner(owner);
        const repoById = new Map<number, RepositoryMetaRow>();
        for (const r of repoRows) {
            repoById.set(r.id, r);
        }

        const commitRows = await getCommitsByOwner(owner, { since, until });

        const commitsByRepoId = new Map<number, typeof commitRows>();
        for (const commit of commitRows) {
            let group = commitsByRepoId.get(commit.repo_id);
            if (!group) {
                group = [];
                commitsByRepoId.set(commit.repo_id, group);
            }
            group.push(commit);
        }

        const data = repoRows
            .filter((r) => commitsByRepoId.has(r.id))
            .map((r) => ({
                repo: mapRepoRow(r, ownerInfo),
                commits: (commitsByRepoId.get(r.id) ?? []).map((c) => mapCommitRow(c, r.name))
            }));

        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/repos/:owner/:repo/commits — Commit history ───────────────────

commits.get("/api/repos/:owner/:repo/commits", async (c) => {
    try {
        const { owner, repo } = c.req.param();
        requireConfig(owner);

        const repoRow = await getRepoByName(owner, repo);
        if (!repoRow) {
            const { notFound } = await import("../errors.ts");
            throw notFound("Repository", `${owner}/${repo}`);
        }

        const since = c.req.query("since") || undefined;
        const until = c.req.query("until") || undefined;

        const rows = await getCommitsByRepo(repoRow.id, { since, until });
        const data = rows.map((r) => mapCommitRow(r, repo));
        return c.json(data);
    } catch (error) {
        return errorResponse(c, error);
    }
});

export { commits };
