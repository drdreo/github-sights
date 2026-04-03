import { differenceInDays, subDays } from "date-fns";
import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CommitActivity } from "../components/CommitActivity";
import { CommitTrends } from "../components/CommitTrends";
import { DashboardHeader } from "../components/DashboardHeader";
import { ContributorLeaderboard } from "../components/dashboard/ContributorLeaderboard";
import { RepoRanking } from "../components/dashboard/RepoRanking";
import { LanguageDistribution } from "../components/LanguageDistribution";
import { StatCards } from "../components/StatCards";
import {
    useCommitTimelines,
    useContributorOverview,
    useOwnerWorkflowStats,
    useStats,
    useSync
} from "../hooks/useGitHub";
import { useOwner } from "../hooks/useOwner";
import { useSyncProgress } from "../hooks/useSyncProgress";

export default function DashboardPage() {
    const [dateRange, setDateRange] = useState({
        startDate: subDays(new Date(), 30),
        endDate: new Date()
    });

    const owner = useOwner();

    const since = dateRange.startDate.toISOString();
    const until = dateRange.endDate.toISOString();

    const { data: stats, isLoading: statsLoading } = useStats(owner, since, until);
    const { data: workflowStats } = useOwnerWorkflowStats(owner, since, until);
    const { data: timelines, isLoading: timelinesLoading } = useCommitTimelines(
        owner,
        since,
        until
    );
    const { data: contributors, isLoading: contributorsLoading } = useContributorOverview(
        owner,
        since,
        until
    );

    // Read initial sync range from URL (set by SetupPage on first-time redirect)
    const [searchParams] = useSearchParams();
    const syncSince = searchParams.get("syncSince") || undefined;

    useSync(owner, syncSince);
    const { data: syncProgress } = useSyncProgress(owner);
    const isSyncing = syncProgress?.active ?? false;

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
                />
                <StatCards
                    stats={stats}
                    loading={statsLoading}
                    owner={owner}
                    dateRangeLabel={`Last ${differenceInDays(dateRange.endDate, dateRange.startDate)} days`}
                    workflowStats={workflowStats}
                />

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main content – left 2 columns */}
                    <div className="lg:col-span-2 space-y-6">
                        <CommitTrends
                            timelines={timelines || []}
                            startDate={dateRange.startDate}
                            endDate={dateRange.endDate}
                            loading={timelinesLoading}
                        />
                        <LanguageDistribution stats={stats} loading={statsLoading} />

                        {/* Tablet: leaderboard + ranking side by side below chart */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:hidden gap-6">
                            <ContributorLeaderboard
                                contributors={contributors?.data || []}
                                loading={contributorsLoading}
                                owner={owner}
                            />
                            <RepoRanking
                                timelines={timelines || []}
                                loading={timelinesLoading}
                                owner={owner}
                            />
                        </div>
                    </div>

                    {/* Desktop sidebar */}
                    <div className="hidden lg:block space-y-6">
                        <ContributorLeaderboard
                            contributors={contributors?.data || []}
                            loading={contributorsLoading}
                            owner={owner}
                        />
                        <RepoRanking
                            timelines={timelines || []}
                            loading={timelinesLoading}
                            owner={owner}
                        />
                    </div>
                </div>
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
