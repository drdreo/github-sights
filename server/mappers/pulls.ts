import type { PrEventWithAvatarRow } from "../../shared/db/index.ts";
import type { PullRequest, GitHubUser } from "../types.ts";

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
