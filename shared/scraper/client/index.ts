// ── GitHub Client barrel ──────────────────────────────────────────────────────
//
// Re-exports everything previously exported from shared/scraper/github-client.ts

export { toGitTimestamp, logGraphQLRateLimit, LANGUAGE_COLORS } from "./constants.ts";

export type { RateLimitState } from "./rate-limit.ts";
export {
    RateLimitBudget,
    getBudget,
    setRateLimitHeartbeat,
    guardRateLimit,
    refreshRateLimit,
    getRateLimitState
} from "./rate-limit.ts";

export { createOctokit, verifyToken } from "./octokit.ts";

export type { GitHubRepo } from "./fetch-repos.ts";
export { getExcludedRepos, excludedRepos, isRepoExcluded, fetchRepos } from "./fetch-repos.ts";

export type { GitHubCommit } from "./fetch-commits.ts";
export { COMMITS_GRAPHQL_QUERY, fetchCommits } from "./fetch-commits.ts";

export type { GitHubPR } from "./fetch-pulls.ts";
export {
    PRS_GRAPHQL_QUERY,
    PRS_UPDATED_GRAPHQL_QUERY,
    fetchPullRequests,
    searchPRCounts
} from "./fetch-pulls.ts";

export type {
    GitHubWorkflowRun,
    GitHubWorkflowJob,
    GitHubWorkflowStep
} from "./fetch-workflows.ts";
export {
    VALID_CONCLUSIONS,
    sanitizeConclusion,
    fetchWorkflowRuns,
    fetchWorkflowJobs
} from "./fetch-workflows.ts";
