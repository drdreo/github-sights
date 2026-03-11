import {
    ApiConfig,
    ContributorOverview,
    ContributorDetail,
    OverviewStats,
    Repository,
    Commit,
    PullRequest,
    Contributor,
    RepoContributorStat,
    WorkflowRun,
    WorkflowStat,
    OwnerWorkflowStats
} from "../types";
export interface CachedResponse<T> {
    data: T;
    fetchedAt: number;
}

interface BulkCommitEntry {
    repo: Repository;
    commits: Commit[];
}

export interface SyncProgressResponse {
    active: boolean;
    status?: "fetching_repos" | "syncing_repos" | "aggregating" | "complete" | "error";
    totalRepos?: number;
    syncedRepos?: number;
    currentRepo?: string | null;
    totalEvents?: number;
    elapsedMs?: number;
    lastSyncedAt?: string | null;
}

export const API_BASE = `${import.meta.env.VITE_API_BASE_URL ?? ""}/api`;

class ApiError extends Error {
    constructor(
        public status: number,
        message: string
    ) {
        super(message);
    }
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...options?.headers
        }
    });

    if (!response.ok) {
        throw new ApiError(response.status, await response.text());
    }

    // Handle void responses (like 204)
    if (response.status === 204) {
        return {} as T;
    }

    try {
        return await response.json();
    } catch (_) {
        // If JSON parsing fails but request was ok, return empty object or text
        return {} as T;
    }
}

export const api = {
    getConfig: (owner: string) =>
        fetchApi<{
            configured: boolean;
            owner?: string;
            ownerType?: "user" | "org";
            syncSince?: string | null;
        }>(`/config/${encodeURIComponent(owner)}`),

    setConfig: (config: Omit<ApiConfig, "token">) =>
        fetchApi<void>("/config", {
            method: "POST",
            body: JSON.stringify(config)
        }),

    getRepos: (owner: string) => {
        return fetchApi<CachedResponse<Repository[]>>(`/repos/${encodeURIComponent(owner)}`);
    },

    getRepo: (owner: string, repo: string) => fetchApi<Repository>(`/repos/${owner}/${repo}`),

    getRepoSnapshots: (owner: string) =>
        fetchApi<
            {
                name: string;
                totalPRs: number;
                openPRs: number;
                mergedPRs: number;
                totalAdditions: number;
                totalDeletions: number;
                ciSuccessRate: number;
                ciAvgDurationSeconds: number;
                lastCiConclusion: string | null;
            }[]
        >(`/repo-snapshots/${encodeURIComponent(owner)}`),

    getCommits: (
        owner: string,
        repo: string,
        since?: string,
        until?: string,
        cacheOnly?: boolean
    ) => {
        const params = new URLSearchParams();
        if (since) params.append("since", since);
        if (until) params.append("until", until);
        if (cacheOnly) params.append("cacheOnly", "true");
        return fetchApi<Commit[]>(`/repos/${owner}/${repo}/commits?${params.toString()}`);
    },

    getAllCommits: (owner: string, since?: string, until?: string, cacheOnly?: boolean) => {
        const params = new URLSearchParams();
        if (since) params.append("since", since);
        if (until) params.append("until", until);
        if (cacheOnly) params.append("cacheOnly", "true");
        return fetchApi<BulkCommitEntry[]>(`/commits/${owner}?${params.toString()}`);
    },

    getPulls: (owner: string, repo: string, state: "open" | "closed" | "all" = "all") => {
        return fetchApi<PullRequest[]>(`/repos/${owner}/${repo}/pulls?state=${state}`);
    },

    getContributors: (owner: string, repo: string) =>
        fetchApi<Contributor[]>(`/repos/${owner}/${repo}/contributors`),

    getRepoContributorStats: (owner: string, repo: string) =>
        fetchApi<RepoContributorStat[]>(`/repos/${owner}/${repo}/contributor-stats`),

    getContributorDetail: (owner: string, login: string, since?: string, until?: string) => {
        const params = new URLSearchParams();
        if (since) params.append("since", since);
        if (until) params.append("until", until);
        const qs = params.toString();
        return fetchApi<ContributorDetail>(
            `/contributors/${encodeURIComponent(owner)}/${encodeURIComponent(login)}${qs ? `?${qs}` : ""}`
        );
    },

    getContributorOverview: (owner: string, since?: string, until?: string) => {
        const params = new URLSearchParams();
        if (since) params.append("since", since);
        if (until) params.append("until", until);
        const qs = params.toString();
        return fetchApi<CachedResponse<ContributorOverview[]>>(
            `/contributors/${owner}${qs ? `?${qs}` : ""}`
        );
    },

    getStats: (owner: string, since?: string, until?: string, cacheOnly?: boolean) => {
        const params = new URLSearchParams();
        if (since) params.append("since", since);
        if (until) params.append("until", until);
        if (cacheOnly) params.append("cacheOnly", "true");
        const qs = params.toString();
        return fetchApi<OverviewStats>(`/stats/${owner}${qs ? `?${qs}` : ""}`);
    },

    getWorkflows: (owner: string, repo: string, limit = 100, offset = 0) =>
        fetchApi<WorkflowRun[]>(
            `/repos/${owner}/${repo}/workflows?limit=${limit}&offset=${offset}`
        ),

    getWorkflowStats: (owner: string, repo: string) =>
        fetchApi<WorkflowStat[]>(`/repos/${owner}/${repo}/workflow-stats`),

    getOwnerWorkflowStats: (owner: string) =>
        fetchApi<OwnerWorkflowStats>(`/workflow-stats/${encodeURIComponent(owner)}`),

    /** Trigger sync — ensures data freshness (debounced to hourly).
     *  Pass `since` for explicit backfill syncs. */
    sync: (owner: string, since?: string) => {
        const params = new URLSearchParams();
        if (since) params.append("since", since);
        const qs = params.toString();
        return fetchApi<{
            triggered?: boolean;
            synced?: number;
            repos?: string[];
            errors?: string[];
        }>(`/sync/${encodeURIComponent(owner)}${qs ? `?${qs}` : ""}`, { method: "POST" });
    },
    getSyncProgress: (owner: string) =>
        fetchApi<SyncProgressResponse>(`/sync/progress/${encodeURIComponent(owner)}`),

    deleteConfig: (owner: string) =>
        fetchApi<{ configured: false }>(`/config/${encodeURIComponent(owner)}`, {
            method: "DELETE"
        }),

    deleteOwnerData: (owner: string) =>
        fetchApi<{ deleted: boolean; owner: string }>(`/owner/${encodeURIComponent(owner)}`, {
            method: "DELETE"
        }),

    getAuthMe: () =>
        fetchApi<{
            authenticated: boolean;
            user?: { login: string; avatar_url: string; github_id: number };
        }>("/auth/me"),

    logout: () => fetchApi<void>("/auth/logout", { method: "POST" })
};
