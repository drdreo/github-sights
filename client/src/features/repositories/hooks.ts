import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "../../shared/lib/api";
import type { Commit, DailyCommitActivity, RepoCommitTimeline } from "../../shared/types";

export function useRepos(owner: string) {
    return useQuery({
        queryKey: ["repos", owner],
        queryFn: () => api.getRepos(owner),
        enabled: !!owner
    });
}

export function useRepoSnapshots(owner: string) {
    return useQuery({
        queryKey: ["repo-snapshots", owner],
        queryFn: () => api.getRepoSnapshots(owner),
        enabled: !!owner
    });
}

export function useCommitTimelines(owner: string, since?: string, until?: string) {
    return useQuery({
        queryKey: ["timelines", owner, since, until],
        queryFn: async (): Promise<RepoCommitTimeline[]> => {
            const entries = await api.getAllCommits(owner, since, until, true);

            const timelines: RepoCommitTimeline[] = [];
            for (const entry of entries) {
                if (entry.commits.length > 0) {
                    timelines.push(buildTimeline(entry.repo, entry.commits));
                }
            }

            return timelines.sort((a, b) => b.totalCommits - a.totalCommits);
        },
        enabled: !!owner,
        placeholderData: keepPreviousData
    });
}

/** Group commits by date and build a RepoCommitTimeline. */
function buildTimeline(repo: RepoCommitTimeline["repo"], commits: Commit[]): RepoCommitTimeline {
    const byDate = new Map<string, Commit[]>();

    for (const commit of commits) {
        const date = commit.author.date.split("T")[0];
        const existing = byDate.get(date);
        if (existing) {
            existing.push(commit);
        } else {
            byDate.set(date, [commit]);
        }
    }

    const daily: DailyCommitActivity[] = Array.from(byDate.entries())
        .map(([date, dayCommits]) => ({
            date,
            count: dayCommits.length,
            commits: dayCommits
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

    return {
        repo,
        daily,
        totalCommits: commits.length
    };
}
