import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useOwnerConfig(owner: string) {
    return useQuery({
        queryKey: ["config", owner],
        queryFn: () => api.getConfig(owner),
        retry: false,
        enabled: !!owner
    });
}
