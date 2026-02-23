import { ApiConfig, ContributorOverview, OverviewStats, Repository, Commit, PullRequest, Contributor, RepoContributorStat } from "../types";

interface BulkCommitEntry {
    repo: Repository;
    commits: Commit[];
}

const API_BASE = `${import.meta.env.VITE_API_BASE_URL ?? ""}/api`;

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
    getConfig: () =>
        fetchApi<{ configured: boolean; owner?: string; ownerType?: "user" | "org" }>("/config"),

    setConfig: (config: ApiConfig) =>
        fetchApi<void>("/config", {
            method: "POST",
            body: JSON.stringify(config)
        }),

    getRepos: (owner?: string) => {
        const query = owner ? `?owner=${owner}` : "";
        return fetchApi<Repository[]>(`/repos${query}`);
    },

    getRepo: (owner: string, repo: string) => fetchApi<Repository>(`/repos/${owner}/${repo}`),

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

    getContributorOverview: (owner: string, since?: string, until?: string) => {
        const params = new URLSearchParams();
        if (since) params.append("since", since);
        if (until) params.append("until", until);
        const qs = params.toString();
        return fetchApi<ContributorOverview[]>(`/contributors/${owner}${qs ? `?${qs}` : ""}`);
    },

    getStats: (owner: string, since?: string, until?: string, cacheOnly?: boolean) => {
        const params = new URLSearchParams();
        if (since) params.append("since", since);
        if (until) params.append("until", until);
        if (cacheOnly) params.append("cacheOnly", "true");
        const qs = params.toString();
        return fetchApi<OverviewStats>(`/stats/${owner}${qs ? `?${qs}` : ""}`);
    },

    /** Trigger background sync — fills commit gaps from last fetch to now. */
    sync: (since?: string, until?: string) => {
        const params = new URLSearchParams();
        if (since) params.append("since", since);
        if (until) params.append("until", until);
        const qs = params.toString();
        return fetchApi<{ synced: number; repos: string[]; errors: string[] }>(
            `/sync${qs ? `?${qs}` : ""}`,
            {
                method: "POST"
            }
        );
    }
};
