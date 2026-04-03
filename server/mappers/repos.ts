import type { RepositoryMetaRow } from "../../shared/db/index.ts";
import type { Repository, GitHubUser } from "../types.ts";

/**
 * Map a repository_meta row to the client's Repository shape.
 * Requires owner info (login, avatar_url, html_url) to build the nested `owner` field.
 */
export function mapRepoRow(
    row: RepositoryMetaRow,
    ownerInfo: { login: string; avatar_url: string; html_url: string }
): Repository {
    const owner: GitHubUser = {
        login: ownerInfo.login,
        avatar_url: ownerInfo.avatar_url,
        html_url: ownerInfo.html_url
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
