import { useQuery } from "@tanstack/react-query";
import { api, type SyncProgressResponse } from "../lib/api";

/**
 * Polls the sync progress endpoint.
 * Always enabled when owner is set — self-stops polling when no sync is active.
 */
export function useSyncProgress(owner: string) {
    const query = useQuery<SyncProgressResponse>({
        queryKey: ["syncProgress", owner],
        queryFn: () => api.getSyncProgress(owner),
        refetchInterval: (query) => {
            // Poll every second while a sync is active, stop when idle
            return query.state.data?.active ? 1000 : false;
        },
        enabled: !!owner,
    });

    return query;
}
