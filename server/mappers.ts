// ── Row → Domain Mappers ────────────────────────────────────────────────────────
//
// Pure functions that convert database row types into client-facing domain types.
// Used by route handlers to serve pre-computed data in the exact shape the client expects.
// No DB access here — just type transformations.

import type {
    RepositoryMetaRow,
    CommitEventWithAvatarRow,
    PrEventWithAvatarRow,
    ContributorSnapshotRow,
    OwnerSnapshotRow
} from "./db/index.ts";

import type {
    Repository,
    GitHubUser,
    Commit,
    CommitAuthor,
    PullRequest,
    Contributor,
    ContributorOverview,
    OverviewStats
} from "./types.ts";

// ── Repository ──────────────────────────────────────────────────────────────────

/**
 * Map a repository_meta row to the client's Repository shape.
 * Requires owner info (login, avatar_url, html_url) to build the nested `owner` field.
 */
export function mapRepoRow(
    row: RepositoryMetaRow,
    ownerInfo?: { login: string; avatar_url: string; html_url: string }
): Repository {
    const owner: GitHubUser = ownerInfo
        ? { login: ownerInfo.login, avatar_url: ownerInfo.avatar_url, html_url: ownerInfo.html_url }
        : {
              login: row.owner_login,
              avatar_url: "",
              html_url: `https://github.com/${row.owner_login}`
          };

    return {
        id: row.id,
        name: row.name,
        full_name: row.full_name,
        description: row.description,
        html_url: row.html_url ?? `https://github.com/${row.full_name}`,
        private: row.is_private,
        language: row.language,
        stargazers_count: row.stargazers_count,
        forks_count: row.forks_count,
        open_issues_count: row.open_issues_count,
        default_branch: row.default_branch ?? "main",
        created_at: row.created_at?.toISOString() ?? "",
        updated_at: row.updated_at?.toISOString() ?? "",
        pushed_at: row.pushed_at?.toISOString() ?? "",
        fork: row.is_fork,
        owner
    };
}

// ── Commit ──────────────────────────────────────────────────────────────────────

/** Map a commit_event row (with JOINed avatar) to the client's Commit shape. */
export function mapCommitRow(row: CommitEventWithAvatarRow, repoName?: string): Commit {
    const author: CommitAuthor = {
        name: row.author_login ?? "Unknown",
        email: "",
        date: row.committed_at.toISOString(),
        login: row.author_login ?? undefined,
        avatar_url: row.author_avatar_url ?? undefined
    };

    const committer: CommitAuthor = {
        name: row.committer_login ?? row.author_login ?? "Unknown",
        email: "",
        date: row.committed_at.toISOString(),
        login: row.committer_login ?? undefined,
        avatar_url: row.committer_avatar_url ?? undefined
    };

    return {
        sha: row.sha,
        message: row.message ?? "",
        author,
        committer,
        html_url: row.html_url ?? "",
        stats:
            row.additions || row.deletions
                ? {
                      additions: row.additions,
                      deletions: row.deletions,
                      total: row.additions + row.deletions
                  }
                : undefined,
        ...(repoName ? { repo_name: repoName } : {})
    };
}

// ── Pull Request ────────────────────────────────────────────────────────────────

/** Map a pr_event row (with JOINed avatar) to the client's PullRequest shape. */
export function mapPrRow(row: PrEventWithAvatarRow): PullRequest {
    const user: GitHubUser = {
        login: row.author_login ?? "unknown",
        avatar_url: row.author_avatar_url ?? "",
        html_url: row.author_login ? `https://github.com/${row.author_login}` : ""
    };

    return {
        id: row.id,
        number: row.number,
        title: row.title ?? "",
        state: row.state,
        html_url: row.html_url ?? "",
        user,
        created_at: row.created_at.toISOString(),
        updated_at: row.created_at.toISOString(), // pr_event doesn't track updated_at separately
        closed_at: row.closed_at?.toISOString() ?? null,
        merged_at: row.merged_at?.toISOString() ?? null,
        draft: row.is_draft,
        additions: row.additions,
        deletions: row.deletions,
        changed_files: row.changed_files,
        base: { ref: row.base_ref ?? "" },
        head: { ref: row.head_ref ?? "" }
    };
}

// ── Contributor ─────────────────────────────────────────────────────────────────

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

// ── Overview Stats ──────────────────────────────────────────────────────────────

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
