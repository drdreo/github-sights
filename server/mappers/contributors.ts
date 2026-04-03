import type { ContributorSnapshotRow } from "../../shared/db/index.ts";
import type { Contributor, ContributorOverview } from "../types.ts";

/** Map a contributor_snapshot row to the per-repo Contributor shape. */
export function mapContribSnapshotToContributor(row: ContributorSnapshotRow): Contributor {
    return {
        login: row.contributor_login,
        avatar_url: row.avatar_url ?? "",
        html_url: row.html_url ?? `https://github.com/${row.contributor_login}`,
        contributions: row.total_commits
    };
}

/** Map a contributor_snapshot row to the owner-level ContributorOverview shape. */
export function mapContribSnapshotToOverview(row: ContributorSnapshotRow): ContributorOverview {
    return {
        login: row.contributor_login,
        avatar_url: row.avatar_url ?? "",
        html_url: row.html_url ?? `https://github.com/${row.contributor_login}`,
        totalCommits: row.total_commits,
        totalAdditions: row.total_additions,
        totalDeletions: row.total_deletions,
        totalPRs: row.total_prs,
        repos: row.repos
    };
}
