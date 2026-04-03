import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw, X } from "lucide-react";
import React, { useEffect, useState } from "react";
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

function formatTimeUntil(isoDate: string): string | null {
    const ms = new Date(isoDate).getTime() - Date.now();
    if (ms <= 0) return null;
    const min = Math.ceil(ms / 60000);
    return `~${min}m`;
}

function parseError(raw: string): { repo: string | null; message: string } {
    // Extract "owner/RepoName" from end of string
    const repoMatch = raw.match(/for\s+[\w.-]+\/([\w.-]+)\s*$/i);
    const repo = repoMatch ? repoMatch[1] : null;

    // Extract the action that failed (e.g. "list workflow runs")
    const actionMatch = raw.match(/during:\s*(.+?)(?:\s+for\s+|$)/i);

    let message: string;
    if (actionMatch) {
        message = `Failed to ${actionMatch[1].trim()}`;
    } else if (/ApiError:/i.test(raw)) {
        message = "GitHub API error";
    } else {
        message = raw.length > 60 ? raw.slice(0, 60) + "…" : raw;
    }

    return { repo, message };
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
    const [expanded, setExpanded] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [dismissedJobId, setDismissedJobId] = useState<number | null>(null);

    // Reset dismissed state when a new job completes with errors
    useEffect(() => {
        if (progress.jobId && progress.jobId !== dismissedJobId) {
            setDismissed(false);
        }
    }, [progress.jobId, dismissedJobId]);

    const hasErrors = progress.errors && progress.errors.length > 0;
    const errorCount = progress.errors?.length ?? 0;

    // Completed with errors
    if (!progress.active && hasErrors && !dismissed) {
        const parsedErrors = progress.errors!.map(parseError);
        return (
            <div className="text-sm">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <button
                        onClick={() => setExpanded((v) => !v)}
                        className="text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
                    >
                        Synced, but {errorCount} repo{errorCount !== 1 ? "s" : ""} had issues
                        {expanded ? (
                            <ChevronUp className="w-3 h-3" />
                        ) : (
                            <ChevronDown className="w-3 h-3" />
                        )}
                    </button>
                    <button
                        onClick={() => {
                            setDismissed(true);
                            setDismissedJobId(progress.jobId ?? null);
                        }}
                        className="text-gray-500 hover:text-gray-300 ml-auto transition-colors"
                        aria-label="Dismiss"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
                {expanded && (
                    <div className="mt-2 bg-gray-800/50 rounded-lg p-2 space-y-1">
                        {parsedErrors.map((e, i) => (
                            <div
                                key={i}
                                className="text-xs text-gray-400 flex items-center gap-1.5"
                            >
                                <span className="text-amber-400/80">{e.message}</span>
                                {e.repo && (
                                    <>
                                        <span className="text-gray-600">·</span>
                                        <span className="text-gray-500">{e.repo}</span>
                                    </>
                                )}
                            </div>
                        ))}
                        <p className="text-xs text-gray-600 pt-1">
                            These repos will retry on the next sync.
                        </p>
                    </div>
                )}
            </div>
        );
    }

    if (!progress.active) return null;

    const {
        status,
        totalRepos,
        syncedRepos,
        totalEvents,
        currentRepo,
        elapsedMs,
        rateLimitResetAt
    } = progress;
    const rateLimitWait = rateLimitResetAt ? formatTimeUntil(rateLimitResetAt) : null;

    return (
        <div className="text-sm space-y-1">
            <div className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
                {status === "fetching_repos" && (
                    <span className="text-gray-400">Finding repositories…</span>
                )}
                {status === "aggregating" && (
                    <span className="text-gray-400">Processing data…</span>
                )}
                {status === "syncing_repos" && totalRepos && totalRepos > 0 ? (
                    <>
                        <div
                            className={`${barWidth} h-1.5 bg-gray-800 rounded-full overflow-hidden`}
                        >
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
                    </>
                ) : status === "syncing_repos" ? (
                    <span className="text-gray-400">Syncing…</span>
                ) : null}
            </div>
            {status === "syncing_repos" && (currentRepo || hasErrors || rateLimitWait) && (
                <div className="flex items-center gap-2 pl-5.5">
                    {rateLimitWait ? (
                        <span className="text-amber-400/80 text-xs">
                            API rate limit reached, resuming in {rateLimitWait}
                        </span>
                    ) : currentRepo ? (
                        <span className="text-gray-500 text-xs truncate max-w-[200px]">
                            {currentRepo}
                        </span>
                    ) : null}
                    {hasErrors && (
                        <button
                            onClick={() => setExpanded((v) => !v)}
                            title="Some repos failed but sync is still running"
                            className="text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
                        >
                            <AlertTriangle className="w-3 h-3" />
                            <span>{errorCount} skipped</span>
                            {expanded ? (
                                <ChevronUp className="w-3 h-3" />
                            ) : (
                                <ChevronDown className="w-3 h-3" />
                            )}
                        </button>
                    )}
                </div>
            )}
            {hasErrors && expanded && (
                <div className="ml-5.5 bg-gray-800/50 rounded-lg p-2 space-y-1">
                    {progress.errors!.map(parseError).map((e, i) => (
                        <div key={i} className="text-xs text-gray-400 flex items-center gap-1.5">
                            <span className="text-amber-400/80">{e.message}</span>
                            {e.repo && (
                                <>
                                    <span className="text-gray-600">·</span>
                                    <span className="text-gray-500">{e.repo}</span>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
