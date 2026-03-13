import React from "react";
import type { SyncProgressResponse } from "../lib/api";
import { SyncProgressBar } from "./SyncProgressBar";
import { TimeRangeSelector } from "./TimeRangeSelector";

interface DateRange {
    startDate: Date;
    endDate: Date;
}

interface DashboardHeaderProps {
    owner: string;
    isSyncing: boolean;
    syncProgress?: SyncProgressResponse;
    dateRange: DateRange;
    onDateRangeChange: (range: DateRange) => void;
}

function formatLastSynced(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

export function DashboardHeader({
    owner,
    isSyncing,
    syncProgress,
    dateRange,
    onDateRangeChange
}: DashboardHeaderProps) {
    const lastSyncedAt = syncProgress?.lastSyncedAt;

    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold text-gray-100 tracking-tight flex items-center gap-2">
                    {owner}
                    <span className="text-gray-500 font-normal text-xl">/ Dashboard</span>
                </h1>
                {syncProgress && (isSyncing || syncProgress.errors?.length) ? (
                    <div className="mt-1">
                        <SyncProgressBar progress={syncProgress} />
                    </div>
                ) : lastSyncedAt ? (
                    <p className="mt-1 text-sm text-gray-500">
                        Last synced {formatLastSynced(lastSyncedAt)}
                    </p>
                ) : null}
            </div>
            <div className="flex items-center gap-3">
                <TimeRangeSelector
                    startDate={dateRange.startDate}
                    endDate={dateRange.endDate}
                    onChange={
                        onDateRangeChange as (range: {
                            startDate: Date | null;
                            endDate: Date | null;
                        }) => void
                    }
                />
            </div>
        </div>
    );
}
