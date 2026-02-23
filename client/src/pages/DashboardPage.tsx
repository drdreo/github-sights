import React, { useMemo, useState } from "react";
import { subDays } from "date-fns";

import { useConfig, useRepos, useStats, useCommitTimelines, useSync } from "../hooks/useGitHub";
import { StatCards } from "../components/StatCards";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { DashboardHeader } from "../components/DashboardHeader";
import { LanguageDistribution } from "../components/LanguageDistribution";
import { CommitTrends } from "../components/CommitTrends";
import { CommitActivity } from "../components/CommitActivity";
import { RepoGrid } from "../components/RepoGrid";

export default function DashboardPage() {
    const [dateRange, setDateRange] = useState({
        startDate: subDays(new Date(), 30),
        endDate: new Date()
    });

    const { data: config, isLoading: configLoading } = useConfig();
    const owner = config?.owner || "";

    const since = dateRange.startDate.toISOString();
    const until = dateRange.endDate.toISOString();

    const { data: repos, isLoading: reposLoading } = useRepos(owner);
    const { data: stats, isLoading: statsLoading } = useStats(owner, since, until);
    const { data: timelines, isLoading: timelinesLoading } = useCommitTimelines(
        owner,
        since,
        until
    );

    // Background sync: fills commit gaps from last fetch → now, then refreshes queries
    const { isSyncing } = useSync(owner, since, until);

    // Sort repos: most recently pushed first, then by stars as tiebreaker
    const sortedRepos = useMemo(() => {
        if (!repos) return [];
        return [...repos].sort((a, b) => {
            const aDate = a.updated_at;
            const bDate = b.updated_at;
            const dateCompare = bDate.localeCompare(aDate);
            if (dateCompare !== 0) return dateCompare;
            return b.stargazers_count - a.stargazers_count;
        });
    }, [repos]);
    const commitCounts = useMemo(() => {
        if (!timelines) return new Map<string, number>();
        return new Map(timelines.map((t) => [t.repo.name, t.totalCommits]));
    }, [timelines]);

    if (configLoading) {
        return (
            <div className="p-8 space-y-8 max-w-7xl mx-auto">
                <LoadingSkeleton className="h-12 w-48" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[...Array(4)].map((_, i) => (
                        <LoadingSkeleton key={i} className="h-32 w-full rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                <DashboardHeader
                    owner={owner}
                    isSyncing={isSyncing}
                    dateRange={dateRange}
                    onDateRangeChange={setDateRange}
                />

                <div className="grid grid-cols-1 gap-6">
                    <StatCards stats={stats} loading={statsLoading} />
                </div>

                <LanguageDistribution stats={stats} loading={statsLoading} />

                <CommitTrends
                    timelines={timelines || []}
                    startDate={dateRange.startDate}
                    endDate={dateRange.endDate}
                    loading={timelinesLoading}
                />

                <CommitActivity
                    timelines={timelines || []}
                    startDate={dateRange.startDate}
                    endDate={dateRange.endDate}
                    loading={timelinesLoading}
                />

                <RepoGrid
                    repos={sortedRepos}
                    owner={owner}
                    loading={reposLoading}
                    commitCounts={commitCounts}
                />
            </div>
        </div>
    );
}
