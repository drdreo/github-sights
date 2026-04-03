import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "../../shared/lib/api";
import type { Commit, DailyCommitActivity, RepoCommitTimeline } from "../../shared/types";

export function useStats(owner: string, since?: string, until?: string) {
    return useQuery({
        queryKey: ["stats", owner, since, until],
        queryFn: () => api.getStats(owner, since, until, true),
        enabled: !!owner,
        placeholderData: keepPreviousData
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

export function useSync(owner: string, since?: string) {
    const queryClient = useQueryClient();
    const syncedRef = useRef<string | null>(null);

    const syncMutation = useMutation({
        mutationFn: () => api.sync(owner, since),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["syncProgress", owner] });
            queryClient.invalidateQueries({ queryKey: ["stats", owner] });
            queryClient.invalidateQueries({ queryKey: ["timelines", owner] });
            queryClient.invalidateQueries({ queryKey: ["repo-snapshots", owner] });
        },
        onError: (error) => {
            console.error("[sync] Failed:", error);
        }
    });

    useEffect(() => {
        if (!owner) return;
        if (syncedRef.current === owner) return;
        if (syncMutation.isPending) return;

        syncedRef.current = owner;
        syncMutation.mutate();
    }, [owner]);
}

export function useContributorOverview(owner: string, since?: string, until?: string) {
    return useQuery({
        queryKey: ["contributor-overview", owner, since, until],
        queryFn: () => api.getContributorOverview(owner, since, until),
        enabled: !!owner
    });
}

export function useOwnerWorkflowStats(owner: string, since?: string, until?: string) {
    return useQuery({
        queryKey: ["owner-workflow-stats", owner, since, until],
        queryFn: () => api.getOwnerWorkflowStats(owner, since, until),
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
