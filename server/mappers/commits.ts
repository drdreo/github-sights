import type { CommitEventWithAvatarRow } from "../../shared/db/index.ts";
import type { Commit, CommitAuthor } from "../types.ts";

/** Map a commit_event row (with JOINed avatar) to the client's Commit shape. */
export function mapCommitRow(row: CommitEventWithAvatarRow, repoName: string): Commit {
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
        repo_name: repoName
    };
}
