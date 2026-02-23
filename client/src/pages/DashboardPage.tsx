import {subDays} from "date-fns";
import React, {useState} from "react";
import {CommitActivity} from "../components/CommitActivity";
import {CommitTrends} from "../components/CommitTrends";
import {DashboardHeader} from "../components/DashboardHeader";
import {LanguageDistribution} from "../components/LanguageDistribution";
import {StatCards} from "../components/StatCards";

import {useCommitTimelines, useStats, useSync} from "../hooks/useGitHub";
import {useOwner} from "../hooks/useOwner";

export default function DashboardPage() {
    const [dateRange, setDateRange] = useState({
        startDate: subDays(new Date(), 30),
        endDate: new Date()
    });

    const owner = useOwner();

    const since = dateRange.startDate.toISOString();
    const until = dateRange.endDate.toISOString();

    const { data: stats, isLoading: statsLoading } = useStats(owner, since, until);
    const { data: timelines, isLoading: timelinesLoading } = useCommitTimelines(
        owner,
        since,
        until
    );

    // Background sync: fills commit gaps from last fetch → now, then refreshes queries
    const { isSyncing } = useSync(owner, since, until);

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
                    <StatCards stats={stats} loading={statsLoading} owner={owner} />
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
            </div>
        </div>
    );
}
