import type { Commit, DailyCommitActivity, RepoCommitTimeline } from "@github-sights/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../shared/lib/api";

export function useRepo(owner: string, repo: string) {
    return useQuery({
        queryKey: ["repo", owner, repo],
        queryFn: () => api.getRepo(owner, repo)
    });
}

export function useCommits(owner: string, repo: string, since?: string, until?: string) {
    return useQuery({
        queryKey: ["commits", owner, repo, since, until],
        queryFn: () => api.getCommits(owner, repo, since, until)
    });
}

export function useRepoTimeline(owner: string, repo: string, since?: string, until?: string) {
    return useQuery({
        queryKey: ["timeline", owner, repo, since, until],
        queryFn: async (): Promise<RepoCommitTimeline> => {
            const [repoData, commits] = await Promise.all([
                api.getRepo(owner, repo),
                api.getCommits(owner, repo, since, until)
            ]);
            return buildTimeline(repoData, commits);
        }
    });
}

export function usePulls(owner: string, repo: string) {
    return useQuery({
        queryKey: ["pulls", owner, repo],
        queryFn: () => api.getPulls(owner, repo)
    });
}

export function useContributors(owner: string, repo: string) {
    return useQuery({
        queryKey: ["contributors", owner, repo],
        queryFn: () => api.getContributors(owner, repo)
    });
}

export function useRepoContributorStats(owner: string, repo: string) {
    return useQuery({
        queryKey: ["repo-contributor-stats", owner, repo],
        queryFn: () => api.getRepoContributorStats(owner, repo),
        enabled: !!owner && !!repo
    });
}

export function useWorkflows(owner: string, repo: string) {
    return useQuery({
        queryKey: ["workflows", owner, repo],
        queryFn: () => api.getWorkflows(owner, repo),
        enabled: !!owner && !!repo
    });
}

export function useWorkflowStats(owner: string, repo: string) {
    return useQuery({
        queryKey: ["workflow-stats", owner, repo],
        queryFn: () => api.getWorkflowStats(owner, repo),
        enabled: !!owner && !!repo
    });
}

export function useWorkflowInsights(owner: string, repo: string, enabled = true) {
    return useQuery({
        queryKey: ["workflow-insights", owner, repo],
        queryFn: () => api.getWorkflowInsights(owner, repo),
        enabled: !!owner && !!repo && enabled
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
