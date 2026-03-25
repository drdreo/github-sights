import { useQuery } from "@tanstack/react-query";
import { api, type SyncProgressResponse } from "../lib/api";

/**
 * Polls the sync progress endpoint.
 * Fast-polls (10s) while a sync is active, slow-polls (1min) when idle
 * so it picks up newly started syncs.
 */
export function useSyncProgress(owner: string) {
    const query = useQuery<SyncProgressResponse>({
        queryKey: ["syncProgress", owner],
        queryFn: () => api.getSyncProgress(owner),
        refetchInterval: (query) => {
            return query.state.data?.active ? 10000 : 60000;
        },
        enabled: !!owner
    });

    return query;
}
