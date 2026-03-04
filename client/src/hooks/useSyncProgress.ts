import { useQuery } from "@tanstack/react-query";
import { api, type SyncProgressResponse } from "../lib/api";

export function useSyncProgress(owner: string, enabled: boolean) {
    return useQuery<SyncProgressResponse>({
        queryKey: ["syncProgress", owner],
        queryFn: () => api.getSyncProgress(owner),
        refetchInterval: enabled ? 1000 : false,
        enabled,
    });
}
