import React from "react";
import { RefreshCw } from "lucide-react";
import type { SyncProgressResponse } from "../lib/api";

function formatEvents(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

interface SyncProgressBarProps {
    progress: SyncProgressResponse;
    /** Width of the bar track. Defaults to "w-32" */
    barWidth?: string;
}

/**
 * Reusable sync progress indicator.
 * Shows spinner + status text + progress bar during active syncs.
 * Returns null when no sync is active.
 */
export function SyncProgressBar({ progress, barWidth = "w-32" }: SyncProgressBarProps) {
    if (!progress.active) return null;

    const { status, totalRepos, syncedRepos, totalEvents } = progress;

    return (
        <div className="flex items-center gap-2 text-sm">
            <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
            {status === "fetching_repos" && (
                <span className="text-gray-400">Discovering repositories…</span>
            )}
            {status === "aggregating" && (
                <span className="text-gray-400">Building snapshots…</span>
            )}
            {status === "syncing_repos" && totalRepos && totalRepos > 0 ? (
                <>
                    <div className={`${barWidth} h-1.5 bg-gray-800 rounded-full overflow-hidden`}>
                        <div
                            className="h-full bg-blue-400 rounded-full transition-all duration-500 ease-out"
                            style={{
                                width: `${Math.round(((syncedRepos ?? 0) / totalRepos) * 100)}%`
                            }}
                        />
                    </div>
                    <span className="text-gray-400">
                        {syncedRepos}/{totalRepos} repos
                        {totalEvents ? ` · ${formatEvents(totalEvents)} events` : ""}
                    </span>
                </>
            ) : status === "syncing_repos" ? (
                <span className="text-gray-400">Syncing…</span>
            ) : null}
        </div>
    );
}
