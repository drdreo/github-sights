// ── Domain Types ────────────────────────────────────────────────────────────────

export interface GitHubUser {
    login: string;
    avatar_url: string;
    html_url: string;
}

export interface Repository {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    html_url: string;
    private: boolean;
    language: string | null;
    stargazers_count: number;
    forks_count: number;
    open_issues_count: number;
    default_branch: string;
    created_at: string;
    updated_at: string;
    pushed_at: string;
    fork: boolean;
    owner: GitHubUser;
}

export interface CommitAuthor {
    name: string;
    email: string;
    date: string;
    login?: string;
    avatar_url?: string;
}

export interface Commit {
    sha: string;
    message: string;
    author: CommitAuthor;
    committer: CommitAuthor;
    html_url: string;
    stats?: { additions: number; deletions: number; total: number };
    repo_name?: string;
}

export interface PullRequest {
    id: number;
    number: number;
    title: string;
    state: "open" | "closed";
    html_url: string;
    user: GitHubUser;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    merged_at: string | null;
    draft: boolean;
    additions?: number;
    deletions?: number;
    changed_files?: number;
    base: { ref: string };
    head: { ref: string };
}

export interface Contributor {
    login: string;
    avatar_url: string;
    html_url: string;
    contributions: number;
}

export interface OverviewStats {
    totalRepos: number;
    totalCommits: number;
    totalPRs: number;
    openPRs: number;
    mergedPRs: number;
    totalAdditions: number;
    totalDeletions: number;
    uniqueContributors: number;
    mostActiveRepo: { name: string; commits: number } | null;
    longestStreak: number;
    currentStreak: number;
    avgCommitsPerDay: number;
    topContributors: Contributor[];
    languageBreakdown: { language: string; count: number; color: string }[];
}

// ── Workflow Types ────────────────────────────────────────────────────────────

export interface WorkflowRun {
    id: number;
    workflowName: string | null;
    workflowPath: string | null;
    actorLogin: string | null;
    runNumber: number | null;
    status: string | null;
    conclusion: string | null;
    headBranch: string | null;
    durationSeconds: number | null;
    createdAt: string;
}

export interface WorkflowStat {
    workflowName: string;
    totalRuns: number;
    successCount: number;
    failureCount: number;
    cancelledCount: number;
    avgDurationSeconds: number;
    totalDurationSeconds: number;
    successRate: number;
}

export interface OwnerWorkflowStats {
    totalRuns: number;
    totalDurationSeconds: number;
    totalMinutes: number;
    successRate: number;
    avgDurationSeconds: number;
    topFailingWorkflows: { workflowName: string; repoName: string; failureCount: number }[];
    topContributorsByMinutes: { login: string; totalMinutes: number; runCount: number }[];
}

/** Raw weekly stats from GitHub's /repos/{owner}/{repo}/stats/contributors endpoint. */
export interface ContributorWeekStat {
    w: number; // unix timestamp (start of week)
    a: number; // additions
    d: number; // deletions
    c: number; // commits
}

/** Per-author stats from GitHub's stats/contributors endpoint. */
export interface RepoContributorStats {
    author: {
        login: string;
        id: number;
        avatar_url: string;
    };
    total: number;
    weeks: ContributorWeekStat[];
}

export interface RepoContributorStat {
    login: string;
    avatar_url: string;
    html_url: string;
    totalCommits: number;
    totalAdditions: number;
    totalDeletions: number;
}

/** Aggregated contributor overview across all repos. */
export interface ContributorOverview extends RepoContributorStat {
    totalPRs: number;
    repos: string[];
}

export interface ApiConfig {
    token: string;
    owner: string;
    ownerType: "user" | "org";
    syncSince?: string;
}

export interface DailyCommitActivity {
    date: string;
    count: number;
    commits: Commit[];
}

export interface RepoCommitTimeline {
    repo: Repository;
    daily: DailyCommitActivity[];
    totalCommits: number;
}

export interface DateRange {
    startDate: string;
    endDate: string;
}

/** Detail view for a single contributor across all repos. */
export interface ContributorDetail {
    login: string;
    avatar_url: string;
    html_url: string;
    totalCommits: number;
    totalAdditions: number;
    totalDeletions: number;
    totalPRs: number;
    totalPRsMerged: number;
    activeDays: number;
    firstCommitAt: string | null;
    lastCommitAt: string | null;
    repoBreakdown: {
        repo: string;
        commits: number;
        additions: number;
        deletions: number;
        prs: number;
        prsMerged: number;
    }[];
    dailyActivity: {
        date: string;
        commits: number;
        additions: number;
        deletions: number;
        prsOpened: number;
        prsMerged: number;
    }[];
}
