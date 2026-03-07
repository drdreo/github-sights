import { Hono } from "hono";
import { requireConfig } from "../config.ts";
import { errorResponse, notFound } from "../errors.ts";
import { getContributorSnapshot } from "../db/queries/snapshots.ts";
import {
    getContributorDailyActivity,
    getContributorRepoBreakdown
} from "../db/queries/activity.ts";
import type { ContributorDetail } from "../types.ts";

const contributorDetail = new Hono();

contributorDetail.get("/api/contributors/:owner/:login", async (c) => {
    try {
        const { owner, login } = c.req.param();
        requireConfig(owner);

        const since = c.req.query("since");
        const until = c.req.query("until");
        const dateFilter = since || until ? { since, until } : undefined;
        const isFiltered = !!dateFilter;

        const snapshot = await getContributorSnapshot(owner, login);
        if (!snapshot) {
            throw notFound("Contributor", login);
        }

        const [dailyRows, repoBreakdown] = await Promise.all([
            getContributorDailyActivity(owner, login, dateFilter),
            getContributorRepoBreakdown(owner, login, dateFilter)
        ]);

        const totalAdditions = repoBreakdown.reduce((sum, r) => sum + Number(r.additions), 0);
        const totalDeletions = repoBreakdown.reduce((sum, r) => sum + Number(r.deletions), 0);

        // When date-filtered, compute summary stats from filtered breakdown data
        const totalCommits = isFiltered
            ? repoBreakdown.reduce((sum, r) => sum + Number(r.commits), 0)
            : snapshot.total_commits;
        const totalPRs = isFiltered
            ? repoBreakdown.reduce((sum, r) => sum + Number(r.prs), 0)
            : snapshot.total_prs;
        const totalPRsMerged = isFiltered
            ? repoBreakdown.reduce((sum, r) => sum + Number(r.prs_merged), 0)
            : snapshot.total_prs_merged;
        const activeDays = isFiltered
            ? dailyRows.filter((r) => r.commit_count > 0 || r.pr_opened > 0 || r.pr_merged > 0)
                  .length
            : snapshot.active_days;

        const result: ContributorDetail = {
            login: snapshot.contributor_login,
            avatar_url: snapshot.avatar_url ?? "",
            html_url: snapshot.html_url ?? `https://github.com/${snapshot.contributor_login}`,
            totalCommits,
            totalAdditions,
            totalDeletions,
            totalPRs,
            totalPRsMerged,
            activeDays,
            firstCommitAt: snapshot.first_commit_at
                ? new Date(snapshot.first_commit_at).toISOString()
                : null,
            lastCommitAt: snapshot.last_commit_at
                ? new Date(snapshot.last_commit_at).toISOString()
                : null,
            repoBreakdown: repoBreakdown.map((r) => ({
                repo: r.repo,
                commits: Number(r.commits),
                additions: Number(r.additions),
                deletions: Number(r.deletions),
                prs: Number(r.prs),
                prsMerged: Number(r.prs_merged)
            })),
            dailyActivity: dailyRows.map((r) => ({
                date: r.date,
                commits: r.commit_count,
                additions: r.additions,
                deletions: r.deletions,
                prsOpened: r.pr_opened,
                prsMerged: r.pr_merged
            }))
        };

        return c.json(result);
    } catch (error) {
        return errorResponse(c, error);
    }
});

export { contributorDetail };
