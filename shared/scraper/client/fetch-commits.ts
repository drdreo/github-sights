// ── Commit Fetching ───────────────────────────────────────────────────────────

import { Octokit } from "octokit";
import { githubApiError } from "../../errors.ts";
import { toGitTimestamp, logGraphQLRateLimit } from "./constants.ts";
import { guardRateLimit } from "./rate-limit.ts";

export interface GitHubCommit {
    sha: string;
    message: string;
    html_url: string;
    committed_at: string;
    author_login: string | null;
    author_name: string;
    author_email: string;
    author_avatar_url: string | null;
    committer_login: string | null;
    additions: number;
    deletions: number;
    is_merge: boolean;
}

export const COMMITS_GRAPHQL_QUERY = `
query ($owner: String!, $repo: String!, $since: GitTimestamp, $until: GitTimestamp, $after: String) {
    repository(owner: $owner, name: $repo) {
        defaultBranchRef {
            target {
                ... on Commit {
                    history(first: 100, since: $since, until: $until, after: $after) {
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                        nodes {
                            oid
                            message
                            additions
                            deletions
                            changedFilesIfAvailable
                            url
                            author {
                                name
                                email
                                date
                                user {
                                    login
                                    avatarUrl
                                }
                            }
                            committer {
                                name
                                email
                                date
                                user {
                                    login
                                    avatarUrl
                                }
                            }
                            parents(first: 0) {
                                totalCount
                            }
                        }
                    }
                }
            }
        }
    }
    rateLimit {
        remaining
        limit
        resetAt
    }
}`;

/**
 * Fetch commits for a single repo via GraphQL API.
 * Unlike REST, GraphQL returns additions/deletions per commit, fixing LOC=0.
 * When `onPage` is provided, commits stream to the callback and the return value is `[]`.
 */
export async function fetchCommits(
    octokit: Octokit,
    owner: string,
    repo: string,
    options: { since?: string; until?: string; onPage: (page: GitHubCommit[]) => Promise<void> }
): Promise<void> {
    try {
        await guardRateLimit(octokit);

        let totalCount = 0;
        let cursor: string | null = null;
        let hasNextPage = true;

        while (hasNextPage) {
            // deno-lint-ignore no-explicit-any
            const response: any = await octokit.graphql(COMMITS_GRAPHQL_QUERY, {
                owner,
                repo,
                since: toGitTimestamp(options.since),
                until: toGitTimestamp(options.until),
                after: cursor
            });

            logGraphQLRateLimit(response);

            const history = response.repository?.defaultBranchRef?.target?.history;
            if (!history) break; // Empty repo or no default branch

            const page: GitHubCommit[] = [];
            // deno-lint-ignore no-explicit-any
            for (const node of history.nodes) {
                page.push({
                    sha: node.oid,
                    message: node.message,
                    html_url: node.url,
                    committed_at:
                        node.committer?.date || node.author?.date || new Date().toISOString(),
                    author_login: node.author?.user?.login ?? null,
                    author_name: node.author?.name || "Unknown",
                    author_email: node.author?.email || "",
                    author_avatar_url: node.author?.user?.avatarUrl ?? null,
                    committer_login: node.committer?.user?.login ?? null,
                    additions: node.additions ?? 0,
                    deletions: node.deletions ?? 0,
                    is_merge: (node.parents?.totalCount ?? 0) > 1
                });
            }

            await options.onPage(page);
            totalCount += page.length;

            hasNextPage = history.pageInfo.hasNextPage;
            cursor = history.pageInfo.endCursor;
        }

        console.log(
            `[github] GET commits for ${owner}/${repo} → ${totalCount} commits (via GraphQL)` +
                (options.since ? ` (since ${options.since.split("T")[0]})` : "")
        );
    } catch (error) {
        throw githubApiError(`list commits for ${owner}/${repo}`, error);
    }
}
