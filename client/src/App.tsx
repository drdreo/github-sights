import { Routes, Route, Navigate } from "react-router-dom";
import * as Tooltip from "@radix-ui/react-tooltip";
import Layout from "./components/Layout";
import SetupPage from "./pages/SetupPage";
import DashboardPage from "./pages/DashboardPage";
import RepoDetailPage from "./pages/RepoDetailPage";
import ContributorsPage from "./pages/ContributorsPage";
import { useConfig } from "./hooks/useGitHub";

/** Redirects to /dashboard if configured, /setup otherwise. */
function RootRedirect() {
    const { data, isLoading } = useConfig();

    if (isLoading) return null;

    return data?.configured ? (
        <Navigate to="/dashboard" replace />
    ) : (
        <Navigate to="/setup" replace />
    );
}

export default function App() {
    return (
        <Tooltip.Provider delayDuration={200}>
            <Routes>
                <Route path="/setup" element={<SetupPage />} />
                <Route element={<Layout />}>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/repo/:owner/:repo" element={<RepoDetailPage />} />
                    <Route path="/contributors" element={<ContributorsPage />} />
                </Route>
                <Route path="*" element={<RootRedirect />} />
            </Routes>
        </Tooltip.Provider>
    );
}
