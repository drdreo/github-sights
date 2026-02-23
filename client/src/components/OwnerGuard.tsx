import { Navigate } from "react-router-dom";
import { useOwnerConfig } from "../hooks/useGitHub";
import { useOwner } from "../hooks/useOwner";
import { Loader2 } from "lucide-react";

/**
 * Wraps owner-scoped routes. Checks if the owner has a config on the server.
 * If not configured, redirects to /setup.
 * While checking, shows a minimal loading state.
 */
export default function OwnerGuard({ children }: { children: React.ReactNode }) {
    const owner = useOwner();
    const { data, isLoading } = useOwnerConfig(owner);

    if (!owner) {
        return <Navigate to="/" replace />;
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
        );
    }

    if (!data?.configured) {
        return <Navigate to="/setup" replace />;
    }

    return <>{children}</>;
}
