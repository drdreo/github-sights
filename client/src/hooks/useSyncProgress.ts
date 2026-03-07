import { useQuery } from "@tanstack/react-query";
import { api, type SyncProgressResponse } from "../lib/api";

/**
 * Polls the sync progress endpoint.
 * Fast-polls (1s) while a sync is active, slow-polls (5s) when idle
 * so it picks up newly started syncs.
 */
export function useSyncProgress(owner: string) {
    const query = useQuery<SyncProgressResponse>({
        queryKey: ["syncProgress", owner],
        queryFn: () => api.getSyncProgress(owner),
        refetchInterval: (query) => {
            return query.state.data?.active ? 1000 : 5000;
        },
        enabled: !!owner
    });

    return query;
}
