import type { OwnerSnapshotRow } from "../../shared/db/index.ts";
import type { OverviewStats } from "../types.ts";

/** Map an owner_snapshot row to the client's OverviewStats shape. */
export function mapOwnerSnapshotToStats(snap: OwnerSnapshotRow): OverviewStats {
    return {
        totalRepos: snap.total_repos,
        totalCommits: snap.total_commits,
        totalPRs: snap.total_prs,
        openPRs: snap.open_prs,
        mergedPRs: snap.merged_prs,
        totalAdditions: snap.total_additions,
        totalDeletions: snap.total_deletions,
        uniqueContributors: snap.unique_contributors,
        mostActiveRepo: snap.most_active_repo_name
            ? { name: snap.most_active_repo_name, commits: snap.most_active_repo_commits }
            : null,
        longestStreak: snap.longest_streak,
        currentStreak: snap.current_streak,
        avgCommitsPerDay: snap.avg_commits_per_day,
        topContributors: snap.top_contributors.map((tc) => ({
            login: tc.login,
            avatar_url: tc.avatar_url,
            html_url: `https://github.com/${tc.login}`,
            contributions: tc.commits
        })),
        languageBreakdown: snap.language_breakdown
    };
}

/** Build an empty OverviewStats for when no snapshot exists yet. */
export function emptyOverviewStats(): OverviewStats {
    return {
        totalRepos: 0,
        totalCommits: 0,
        totalPRs: 0,
        openPRs: 0,
        mergedPRs: 0,
        totalAdditions: 0,
        totalDeletions: 0,
        uniqueContributors: 0,
        mostActiveRepo: null,
        longestStreak: 0,
        currentStreak: 0,
        avgCommitsPerDay: 0,
        topContributors: [],
        languageBreakdown: []
    };
}
