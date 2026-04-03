import { useQuery } from "@tanstack/react-query";
import { api } from "../../shared/lib/api";

export function useContributorOverview(owner: string, since?: string, until?: string) {
    return useQuery({
        queryKey: ["contributor-overview", owner, since, until],
        queryFn: () => api.getContributorOverview(owner, since, until),
        enabled: !!owner
    });
}

export function useContributorDetail(owner: string, login: string, since?: string, until?: string) {
    return useQuery({
        queryKey: ["contributor-detail", owner, login, since, until],
        queryFn: () => api.getContributorDetail(owner, login, since, until),
        enabled: !!owner && !!login
    });
}
