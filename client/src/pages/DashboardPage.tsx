import { subDays } from "date-fns";
import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CommitActivity } from "../components/CommitActivity";
import { CommitTrends } from "../components/CommitTrends";
import { DashboardHeader } from "../components/DashboardHeader";
import { LanguageDistribution } from "../components/LanguageDistribution";
import { StatCards } from "../components/StatCards";
import { api } from "../lib/api";

import { useCommitTimelines, useStats, useSync } from "../hooks/useGitHub";
import { useOwner } from "../hooks/useOwner";
import { useSyncProgress } from "../hooks/useSyncProgress";

export default function DashboardPage() {
    const [dateRange, setDateRange] = useState({
        startDate: subDays(new Date(), 30),
        endDate: new Date()
    });

    const owner = useOwner();
    const navigate = useNavigate();

    const handleDelete = async () => {
        if (!window.confirm(`Delete ALL data for "${owner}"? This cannot be undone.`)) return;
        await api.deleteOwnerData(owner);
        navigate("/");
    };

    const since = dateRange.startDate.toISOString();
    const until = dateRange.endDate.toISOString();

    const { data: stats, isLoading: statsLoading } = useStats(owner, since, until);
    const { data: timelines, isLoading: timelinesLoading } = useCommitTimelines(
        owner,
        since,
        until
    );

    // Read initial sync range from URL (set by SetupPage on first-time redirect)
    const [searchParams] = useSearchParams();
    const syncSince = searchParams.get("syncSince") || undefined;

    // Background sync: incremental from high-water mark → now, then refreshes queries
    const { isSyncing } = useSync(owner, syncSince);
    const { data: syncProgress } = useSyncProgress(owner, isSyncing);

    return (
        <div className="min-h-screen bg-gray-950">
            {/* Centered content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
                <DashboardHeader
                    owner={owner}
                    isSyncing={isSyncing}
                    syncProgress={syncProgress}
                    dateRange={dateRange}
                    onDateRangeChange={setDateRange}
                    onDelete={handleDelete}
                />
                <div className="grid grid-cols-1 gap-6">
                    <StatCards stats={stats} loading={statsLoading} owner={owner} />
                </div>

                <LanguageDistribution stats={stats} loading={statsLoading} />
                <CommitTrends
                    timelines={timelines || []}
                    startDate={dateRange.startDate}
                    endDate={dateRange.endDate}
                    loading={timelinesLoading}
                />
            </div>

            {/* Full-bleed commit activity — edge to edge */}
            <div className="mt-8 pb-8">
                <CommitActivity
                    timelines={timelines || []}
                    startDate={dateRange.startDate}
                    endDate={dateRange.endDate}
                    loading={timelinesLoading}
                />
            </div>
        </div>
    );
}
