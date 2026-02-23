import { Routes, Route, Navigate } from "react-router-dom";
import * as Tooltip from "@radix-ui/react-tooltip";
import Layout from "./components/Layout";
import OwnerGuard from "./components/OwnerGuard";
import LandingPage from "./pages/LandingPage";
import SetupPage from "./pages/SetupPage";
import DashboardPage from "./pages/DashboardPage";
import RepoDetailPage from "./pages/RepoDetailPage";
import ContributorsPage from "./pages/ContributorsPage";
import RepositoriesPage from "./pages/RepositoriesPage";

export default function App() {
    return (
        <Tooltip.Provider delayDuration={200}>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/setup" element={<SetupPage />} />
                <Route
                    path="/:owner/*"
                    element={
                        <OwnerGuard>
                            <Layout />
                        </OwnerGuard>
                    }
                >
                    <Route path="dashboard" element={<DashboardPage />} />
                    <Route path="contributors" element={<ContributorsPage />} />
                    <Route path="repositories" element={<RepositoriesPage />} />
                    <Route path="repo/:repo" element={<RepoDetailPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Tooltip.Provider>
    );
}
