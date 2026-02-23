import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "../lib/api";
import type { Commit, DailyCommitActivity, RepoCommitTimeline } from "../types";

// ── Config ──────────────────────────────────────────────────────────────────────

export function useConfig() {
    return useQuery({
        queryKey: ["config"],
        queryFn: api.getConfig,
        retry: false
    });
}

export function useSetConfig() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: api.setConfig,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["config"] });
        }
    });
}

// ── Repos ───────────────────────────────────────────────────────────────────────

export function useRepos(owner?: string) {
    return useQuery({
        queryKey: ["repos", owner],
        queryFn: () => api.getRepos(owner),
        enabled: !!owner
    });
}

export function useRepo(owner: string, repo: string) {
    return useQuery({
        queryKey: ["repo", owner, repo],
        queryFn: () => api.getRepo(owner, repo)
    });
}

// ── Stats ───────────────────────────────────────────────────────────────────────

/**
 * Fetches overview stats with cache-first strategy.
 * Always uses cacheOnly=true (instant, DB-only).
 * The useSync hook fills gaps in the background, then invalidates this query.
 */
export function useStats(owner: string, since?: string, until?: string) {
    return useQuery({
        queryKey: ["stats", owner, since, until],
        queryFn: () => api.getStats(owner, since, until, true),
        enabled: !!owner
    });
}

// ── Commits & Timelines ─────────────────────────────────────────────────────────

export function useCommits(owner: string, repo: string, since?: string, until?: string) {
    return useQuery({
        queryKey: ["commits", owner, repo, since, until],
        queryFn: () => api.getCommits(owner, repo, since, until)
    });
}

/**
 * Fetches commits for all repos via a single bulk endpoint and assembles RepoCommitTimeline[].
 * Uses cacheOnly=true — reads from server DB only, no GitHub API calls.
 * The useSync hook fills gaps, then invalidates this query to show fresh data.
 */
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
        enabled: !!owner
    });
}

// ── Background Sync ─────────────────────────────────────────────────────────────

/**
 * Cache-first background sync hook.
 *
 * After the dashboard renders cached data, this hook fires POST /api/sync
 * to fill commit gaps (last fetch → now). When sync completes, it invalidates
 * the stats + timelines queries so they refetch from the now-fresh DB.
 *
 * Only syncs once per owner+range combination to avoid redundant calls.
 */
export function useSync(owner: string, since?: string, until?: string) {
    const queryClient = useQueryClient();
    const syncedRef = useRef<string | null>(null);

    const syncMutation = useMutation({
        mutationFn: () => api.sync(since, until),
        onSuccess: (result) => {
            console.log(
                `[sync] Done: ${result.synced} commits across ${result.repos.length} repos`
            );
            if (result.errors.length > 0) {
                console.warn(`[sync] Errors:`, result.errors);
            }
            // Invalidate cached queries so they refetch from the now-fresh DB
            queryClient.invalidateQueries({ queryKey: ["stats", owner] });
            queryClient.invalidateQueries({ queryKey: ["timelines", owner] });
        },
        onError: (error) => {
            console.error("[sync] Failed:", error);
        }
    });

    useEffect(() => {
        if (!owner) return;

        // Create a key for this specific sync request to avoid double-firing
        const syncKey = `${owner}:${since}:${until}`;
        if (syncedRef.current === syncKey) return;
        if (syncMutation.isPending) return;

        syncedRef.current = syncKey;
        syncMutation.mutate();
    }, [owner, since, until]);

    return {
        isSyncing: syncMutation.isPending,
        syncError: syncMutation.error,
        syncResult: syncMutation.data
    };
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

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

// ── Repo detail hooks ───────────────────────────────────────────────────────────

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

export function useContributorOverview(owner: string, since?: string, until?: string) {
    return useQuery({
        queryKey: ["contributor-overview", owner, since, until],
        queryFn: () => api.getContributorOverview(owner, since, until),
        enabled: !!owner
    });
}

export function useRepoContributorStats(owner: string, repo: string) {
    return useQuery({
        queryKey: ["repo-contributor-stats", owner, repo],
        queryFn: () => api.getRepoContributorStats(owner, repo),
        enabled: !!owner && !!repo
    });
}
