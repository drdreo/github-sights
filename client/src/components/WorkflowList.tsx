import React from "react";
import { format } from "date-fns";
import { CheckCircle2, XCircle, MinusCircle, Clock, Timer } from "lucide-react";
import { LoadingSkeleton } from "./LoadingSkeleton";
import type { WorkflowRun, WorkflowStat } from "../types";

function formatDuration(seconds: number | null): string {
    if (!seconds) return "-";
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
}

function ConclusionBadge({ conclusion }: { conclusion: string | null }) {
    switch (conclusion) {
        case "success":
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                    <CheckCircle2 className="w-3 h-3" />
                    Success
                </span>
            );
        case "failure":
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                    <XCircle className="w-3 h-3" />
                    Failed
                </span>
            );
        case "cancelled":
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                    <MinusCircle className="w-3 h-3" />
                    Cancelled
                </span>
            );
        default:
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">
                    {conclusion ?? "Unknown"}
                </span>
            );
    }
}

// ── Workflow Stats Panel ─────────────────────────────────────────────────────

interface WorkflowStatsPanelProps {
    stats: WorkflowStat[] | undefined;
    loading: boolean;
}

export function WorkflowStatsPanel({ stats, loading }: WorkflowStatsPanelProps) {
    if (loading) {
        return (
            <div className="p-6 space-y-4">
                <LoadingSkeleton className="h-16 w-full" />
                <LoadingSkeleton className="h-16 w-full" />
            </div>
        );
    }

    if (!stats?.length) {
        return null;
    }

    return (
        <div className="border-b border-gray-800">
            <div className="p-6">
                <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
                    Workflow Breakdown
                </h4>
                <div className="space-y-3">
                    {stats.map((stat) => (
                        <div
                            key={stat.workflowName}
                            className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-200 truncate">
                                    {stat.workflowName}
                                </p>
                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                    <span>{stat.totalRuns} runs</span>
                                    <span className="text-green-400">
                                        {stat.successCount} passed
                                    </span>
                                    {stat.failureCount > 0 && (
                                        <span className="text-red-400">
                                            {stat.failureCount} failed
                                        </span>
                                    )}
                                    {stat.cancelledCount > 0 && (
                                        <span className="text-yellow-400">
                                            {stat.cancelledCount} cancelled
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-400 flex-shrink-0 ml-4">
                                <div className="flex items-center gap-1">
                                    <Timer className="w-3.5 h-3.5" />
                                    <span>~{formatDuration(stat.avgDurationSeconds)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>{formatDuration(stat.totalDurationSeconds)}</span>
                                </div>
                                <span
                                    className={`font-medium ${stat.successRate >= 80 ? "text-green-400" : stat.successRate >= 50 ? "text-yellow-400" : "text-red-400"}`}
                                >
                                    {stat.successRate}%
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Workflow Runs List ────────────────────────────────────────────────────────

interface WorkflowListProps {
    workflows: WorkflowRun[] | undefined;
    workflowStats: WorkflowStat[] | undefined;
    loading: boolean;
    statsLoading: boolean;
}

export function WorkflowList({
    workflows,
    workflowStats,
    loading,
    statsLoading
}: WorkflowListProps) {
    if (loading) {
        return (
            <div className="p-6 space-y-4">
                <LoadingSkeleton className="h-20 w-full" />
                <LoadingSkeleton className="h-20 w-full" />
                <LoadingSkeleton className="h-20 w-full" />
            </div>
        );
    }

    if (!workflows?.length) {
        return <div className="p-12 text-center text-gray-400">No workflow runs found.</div>;
    }

    return (
        <div>
            <WorkflowStatsPanel stats={workflowStats} loading={statsLoading} />
            <div className="divide-y divide-gray-800">
                {workflows.map((run) => (
                    <div
                        key={run.id}
                        className="p-6 hover:bg-gray-800/50 transition-colors flex gap-4"
                    >
                        <div className="mt-1 flex-shrink-0">
                            {run.conclusion === "success" ? (
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                            ) : run.conclusion === "failure" ? (
                                <XCircle className="w-5 h-5 text-red-500" />
                            ) : (
                                <MinusCircle className="w-5 h-5 text-yellow-500" />
                            )}
                        </div>
                        <div className="flex-grow min-w-0">
                            <div className="flex items-start justify-between gap-4 mb-1">
                                <p className="text-sm font-semibold text-gray-100 line-clamp-1">
                                    {run.workflowName ?? "Unknown workflow"}
                                </p>
                                <ConclusionBadge conclusion={run.conclusion} />
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                                {run.runNumber && <span>#{run.runNumber}</span>}
                                {run.actorLogin && (
                                    <>
                                        <span>•</span>
                                        <span>
                                            Triggered by{" "}
                                            <span className="font-medium text-gray-300">
                                                {run.actorLogin}
                                            </span>
                                        </span>
                                    </>
                                )}
                                {run.headBranch && (
                                    <>
                                        <span>•</span>
                                        <span className="font-mono text-gray-500">
                                            {run.headBranch}
                                        </span>
                                    </>
                                )}
                                <span>•</span>
                                <span>{format(new Date(run.createdAt), "MMM d, yyyy")}</span>
                            </div>
                            {run.durationSeconds != null && (
                                <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                                    <Timer className="w-3 h-3" />
                                    <span>{formatDuration(run.durationSeconds)}</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
