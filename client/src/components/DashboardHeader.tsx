import React from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { TimeRangeSelector } from "./TimeRangeSelector";
import type { SyncProgressResponse } from "../lib/api";

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
    onDelete?: () => void;
}

function formatEvents(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function SyncProgressIndicator({ progress }: { progress?: SyncProgressResponse }) {
    if (!progress?.active) {
        return <span className="text-sm text-gray-400">Syncing…</span>;
    }

    const { status, totalRepos, syncedRepos, totalEvents } = progress;

    if (status === "fetching_repos") {
        return <span className="text-sm text-gray-400">Discovering repositories…</span>;
    }

    if (status === "aggregating") {
        return <span className="text-sm text-gray-400">Building snapshots…</span>;
    }

    if (status === "syncing_repos" && totalRepos && totalRepos > 0) {
        const pct = Math.round(((syncedRepos ?? 0) / totalRepos) * 100);
        return (
            <div className="flex items-center gap-2">
                <div className="w-32 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-blue-400 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <span className="text-sm text-gray-400">
                    {syncedRepos}/{totalRepos} repos
                    {totalEvents ? ` · ${formatEvents(totalEvents)} events` : ""}
                </span>
            </div>
        );
    }

    return <span className="text-sm text-gray-400">Syncing…</span>;
}

export function DashboardHeader({
    owner,
    isSyncing,
    syncProgress,
    dateRange,
    onDateRangeChange,
    onDelete
}: DashboardHeaderProps) {
    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold text-gray-100 tracking-tight flex items-center gap-2">
                    {owner}
                    <span className="text-gray-500 font-normal text-xl">/ Dashboard</span>
                    {isSyncing && <RefreshCw className="w-4 h-4 text-blue-400 animate-spin ml-1" />}
                </h1>
                {isSyncing && (
                    <div className="mt-1">
                        <SyncProgressIndicator progress={syncProgress} />
                    </div>
                )}
            </div>
            <div className="flex items-center gap-3">
                <TimeRangeSelector
                    startDate={dateRange.startDate}
                    endDate={dateRange.endDate}
                    onChange={onDateRangeChange}
                />
                {onDelete && (
                    <button
                        onClick={onDelete}
                        title="Delete all owner data"
                        className="p-2 text-gray-500 hover:text-red-400 transition-colors rounded-lg hover:bg-gray-800"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
