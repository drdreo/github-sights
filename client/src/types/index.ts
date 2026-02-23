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
    stats?: {
        additions: number;
        deletions: number;
        total: number;
    };
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
    base: {
        ref: string;
    };
    head: {
        ref: string;
    };
}

export interface Contributor {
    login: string;
    avatar_url: string;
    html_url: string;
    contributions: number;
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

export interface OverviewStats {
    totalRepos: number;
    totalCommits: number;
    totalPRs: number;
    openPRs: number;
    mergedPRs: number;
    uniqueContributors: number;
    mostActiveRepo: {
        name: string;
        commits: number;
    } | null;
    longestStreak: number;
    currentStreak: number;
    avgCommitsPerDay: number;
    topContributors: Contributor[];
    languageBreakdown: { language: string; count: number; color: string }[];
}

export interface ApiConfig {
    token: string;
    owner: string;
    ownerType: "user" | "org";
}

export interface DateRange {
    startDate: string;
    endDate: string;
}
