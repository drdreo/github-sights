import * as Tooltip from "@radix-ui/react-tooltip";
import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./shared/components/Layout";
import OwnerGuard from "./shared/components/OwnerGuard";

const SetupPage = lazy(() => import("./features/setup/SetupPage"));
const LandingPage = lazy(() => import("./features/landing/LandingPage"));
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage"));
const RepoDetailPage = lazy(() => import("./features/repo-detail/RepoDetailPage"));
const ContributorsPage = lazy(() => import("./features/contributors/ContributorsPage"));
const ContributorDetailPage = lazy(() => import("./features/contributors/ContributorDetailPage"));
const RepositoriesPage = lazy(() => import("./features/repositories/RepositoriesPage"));

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
                    <Route path="contributors/:login" element={<ContributorDetailPage />} />
                    <Route path="repositories" element={<RepositoriesPage />} />
                    <Route path="repo/:repo" element={<RepoDetailPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Tooltip.Provider>
    );
}
