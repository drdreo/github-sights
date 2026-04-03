// ── PR Fetching ───────────────────────────────────────────────────────────────

import { Octokit } from "octokit";
import { githubApiError } from "../../errors.ts";
import { logGraphQLRateLimit } from "./constants.ts";
import { guardRateLimit } from "./rate-limit.ts";

export interface GitHubPR {
    id: number;
    number: number;
    title: string;
    state: "open" | "closed";
    html_url: string;
    is_draft: boolean;
    author_login: string | null;
    author_avatar_url: string | null;
    base_ref: string;
    head_ref: string;
    additions: number;
    deletions: number;
    changed_files: number;
    created_at: string;
    closed_at: string | null;
    merged_at: string | null;
    updated_at: string;
}

export const PRS_GRAPHQL_QUERY = `
query ($owner: String!, $repo: String!, $states: [PullRequestState!], $after: String) {
    repository(owner: $owner, name: $repo) {
        pullRequests(first: 100, states: $states, orderBy: {field: CREATED_AT, direction: DESC}, after: $after) {
            pageInfo {
                hasNextPage
                endCursor
            }
            nodes {
                id: databaseId
                number
                title
                state
                url
                createdAt
                updatedAt
                closedAt
                mergedAt
                isDraft
                additions
                deletions
                changedFiles
                baseRefName
                headRefName
                author {
                    login
                    avatarUrl
                    url
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

export const PRS_UPDATED_GRAPHQL_QUERY = `
query ($owner: String!, $repo: String!, $states: [PullRequestState!], $after: String) {
    repository(owner: $owner, name: $repo) {
        pullRequests(first: 100, states: $states, orderBy: {field: UPDATED_AT, direction: DESC}, after: $after) {
            pageInfo {
                hasNextPage
                endCursor
            }
            nodes {
                id: databaseId
                number
                title
                state
                url
                createdAt
                updatedAt
                closedAt
                mergedAt
                isDraft
                additions
                deletions
                changedFiles
                baseRefName
                headRefName
                author {
                    login
                    avatarUrl
                    url
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
 * Fetch pull requests for a repo via GraphQL API.
 * Returns additions/deletions/changedFiles inline per PR, eliminating
 * the N+1 REST enrichment pattern.
 * When `onPage` is provided, PRs stream to the callback and the return value is `[]`.
 */
export async function fetchPullRequests(
    octokit: Octokit,
    owner: string,
    repo: string,
    state: "all" | "open" | "closed" = "all",
    options?: { onPage?: (page: GitHubPR[]) => Promise<void>; updatedSince?: string }
): Promise<GitHubPR[]> {
    try {
        await guardRateLimit(octokit);

        // Map state to GraphQL PullRequestState enum values
        const stateMap: Record<string, string[]> = {
            all: ["OPEN", "CLOSED", "MERGED"],
            open: ["OPEN"],
            closed: ["CLOSED", "MERGED"]
        };
        const states = stateMap[state];

        const allPulls: GitHubPR[] = [];
        let totalCount = 0;
        let cursor: string | null = null;
        let hasNextPage = true;

        while (hasNextPage) {
            await guardRateLimit(octokit);

            const useUpdatedOrder = !!options?.updatedSince;
            // deno-lint-ignore no-explicit-any
            const response: any = await octokit.graphql(
                useUpdatedOrder ? PRS_UPDATED_GRAPHQL_QUERY : PRS_GRAPHQL_QUERY,
                {
                    owner,
                    repo,
                    states,
                    after: cursor
                }
            );

            logGraphQLRateLimit(response);

            const pullRequests = response.repository?.pullRequests;
            if (!pullRequests) break;

            const page: GitHubPR[] = [];
            // deno-lint-ignore no-explicit-any
            for (const node of pullRequests.nodes) {
                // GraphQL state is OPEN, CLOSED, or MERGED — normalize to "open" | "closed"
                const prState: "open" | "closed" = node.state === "OPEN" ? "open" : "closed";

                page.push({
                    id: node.id,
                    number: node.number,
                    title: node.title,
                    state: prState,
                    html_url: node.url,
                    is_draft: node.isDraft ?? false,
                    author_login: node.author?.login ?? null,
                    author_avatar_url: node.author?.avatarUrl ?? null,
                    base_ref: node.baseRefName,
                    head_ref: node.headRefName,
                    additions: node.additions ?? 0,
                    deletions: node.deletions ?? 0,
                    changed_files: node.changedFiles ?? 0,
                    created_at: node.createdAt,
                    closed_at: node.closedAt || null,
                    merged_at: node.mergedAt || null,
                    updated_at: node.updatedAt
                });
            }

            // When doing incremental sync, filter out PRs not updated since threshold
            // and stop pagination when we hit old PRs
            let stopEarly = false;
            if (options?.updatedSince) {
                const threshold = new Date(options.updatedSince).getTime();
                const freshPRs = page.filter(
                    (pr) => new Date(pr.updated_at).getTime() >= threshold
                );
                if (freshPRs.length < page.length) {
                    stopEarly = true;
                }
                if (options?.onPage && freshPRs.length > 0) {
                    await options.onPage(freshPRs);
                    totalCount += freshPRs.length;
                } else if (!options?.onPage) {
                    allPulls.push(...freshPRs);
                }
            } else if (options?.onPage) {
                await options.onPage(page);
                totalCount += page.length;
            } else {
                allPulls.push(...page);
            }

            hasNextPage = pullRequests.pageInfo.hasNextPage && !stopEarly;
            cursor = pullRequests.pageInfo.endCursor;
        }

        const count = options?.onPage ? totalCount : allPulls.length;
        console.log(
            `[github] GET pulls for ${owner}/${repo} (state=${state}) → ${count} PRs (via GraphQL)`
        );

        return allPulls;
    } catch (error) {
        throw githubApiError(`list PRs for ${owner}/${repo}`, error);
    }
}

/** Search-based PR counts (3 API calls, regardless of repo count). */
export async function searchPRCounts(
    octokit: Octokit,
    owner: string,
    options?: { since?: string; until?: string }
): Promise<{ totalPRs: number; openPRs: number; mergedPRs: number }> {
    try {
        const dateRange = options?.since
            ? `created:${options.since.slice(0, 10)}..${options?.until ? options.until.slice(0, 10) : "*"}`
            : "";
        const baseQuery = `type:pr user:${owner}`;

        console.log(`[search] GET PR counts for ${owner} ${dateRange ? `since ${dateRange}` : ""}`);

        const [totalResult, openResult, mergedResult] = await Promise.all([
            octokit.rest.search.issuesAndPullRequests({
                q: [baseQuery, dateRange].filter(Boolean).join(" "),
                per_page: 1
            }),
            octokit.rest.search.issuesAndPullRequests({
                q: [baseQuery, "is:open"].filter(Boolean).join(" "),
                per_page: 1
            }),
            octokit.rest.search.issuesAndPullRequests({
                q: [baseQuery, "is:merged", dateRange].filter(Boolean).join(" "),
                per_page: 1
            })
        ]);

        return {
            totalPRs: totalResult.data.total_count,
            openPRs: openResult.data.total_count,
            mergedPRs: mergedResult.data.total_count
        };
    } catch (error) {
        console.warn(`[search] PR count search failed for ${owner}:`, error);
        return { totalPRs: 0, openPRs: 0, mergedPRs: 0 };
    }
}
