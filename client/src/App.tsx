import * as Tooltip from "@radix-ui/react-tooltip";
import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import OwnerGuard from "./components/OwnerGuard";

const SetupPage = lazy(() => import("./pages/SetupPage"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const RepoDetailPage = lazy(() => import("./pages/RepoDetailPage"));
const ContributorsPage = lazy(() => import("./pages/ContributorsPage"));
const ContributorDetailPage = lazy(() => import("./pages/ContributorDetailPage"));
const RepositoriesPage = lazy(() => import("./pages/RepositoriesPage"));

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
