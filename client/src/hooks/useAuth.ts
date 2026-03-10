import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useAuth() {
    const { data, isLoading } = useQuery({
        queryKey: ["auth"],
        queryFn: api.getAuthMe,
        staleTime: 5 * 60 * 1000, // 5 min
        retry: false
    });

    return {
        user: data?.user ?? null,
        isAuthenticated: data?.authenticated ?? false,
        isLoading
    };
}

export function useLogout() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: api.logout,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["auth"] });
            window.location.href = "/";
        }
    });
}
