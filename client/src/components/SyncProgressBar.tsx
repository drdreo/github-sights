import React from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import type { SyncProgressResponse } from "../lib/api";

function formatEvents(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function formatElapsed(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}m ${sec.toString().padStart(2, "0")}s`;
}

interface SyncProgressBarProps {
    progress: SyncProgressResponse;
    /** Width of the bar track. Defaults to "w-32" */
    barWidth?: string;
}

/**
 * Reusable sync progress indicator.
 * Shows spinner + status text + progress bar during active syncs.
 * Shows warning when there are errors (e.g. crawler offline).
 * Returns null when no sync is active and no errors.
 */
export function SyncProgressBar({ progress, barWidth = "w-32" }: SyncProgressBarProps) {
    const hasErrors = progress.errors && progress.errors.length > 0;

    if (!progress.active && hasErrors) {
        return (
            <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-400">{progress.errors![0]}</span>
            </div>
        );
    }

    if (!progress.active) return null;

    const { status, totalRepos, syncedRepos, totalEvents, currentRepo, elapsedMs } = progress;

    return (
        <div className="flex items-center gap-2 text-sm">
            <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
            {status === "fetching_repos" && (
                <span className="text-gray-400">Discovering repositories…</span>
            )}
            {status === "aggregating" && <span className="text-gray-400">Building snapshots…</span>}
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
                        {elapsedMs ? ` · ${formatElapsed(elapsedMs)}` : ""}
                    </span>
                    {currentRepo && (
                        <span className="text-gray-500 text-xs truncate max-w-[160px]">
                            {currentRepo}
                        </span>
                    )}
                </>
            ) : status === "syncing_repos" ? (
                <span className="text-gray-400">Syncing…</span>
            ) : null}
            {hasErrors && (
                <span className="text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {progress.errors![0]}
                </span>
            )}
        </div>
    );
}
