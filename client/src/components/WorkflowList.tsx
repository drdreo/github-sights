import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { useParams } from "react-router-dom";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import { CheckCircle2, XCircle, MinusCircle, Clock, Timer, ExternalLink, ChevronRight } from "lucide-react";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { useOwner } from "../hooks/useOwner";
import type { WorkflowRun, WorkflowStat, WorkflowJobStepInsights, JobInsight } from "../types";

function formatDuration(seconds: number | null): string {
    if (seconds == null) return "-";
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
}

function WorkflowSparkline({ data, color }: { data: { i: number; v: number; c: string }[]; color: string }) {
    if (data.length < 2) return null;
    const id = `wf-spark-${color.replace("#", "")}`;
    return (
        <div className="w-[72px] h-[28px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 1, right: 0, left: 0, bottom: 1 }}>
                    <defs>
                        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area
                        type="monotone"
                        dataKey="v"
                        stroke={color}
                        strokeWidth={1.2}
                        fill={`url(#${id})`}
                        dot={false}
                        animationDuration={600}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
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

// ── Inline Job/Step Insights for a single workflow ──────────────────────────

function WorkflowInlineInsights({
    workflowName,
    insights
}: {
    workflowName: string;
    insights: WorkflowJobStepInsights | undefined;
}) {
    if (!insights) return null;

    const jobs = insights.jobs.filter((j) => j.workflowName === workflowName);
    const steps = insights.steps.filter((s) => s.workflowName === workflowName);

    if (jobs.length === 0 && steps.length === 0) {
        return (
            <div className="px-4 py-3 text-xs text-gray-500">
                No job or step data available for this workflow yet.
            </div>
        );
    }

    const slowestJobs = [...jobs]
        .sort((a, b) => b.avgDurationSeconds - a.avgDurationSeconds)
        .slice(0, 5);

    const failingSteps = [...steps]
        .filter((s) => s.failureCount > 0)
        .sort((a, b) => b.failureCount - a.failureCount || b.failureRate - a.failureRate)
        .slice(0, 5);

    const failingJobs = [...jobs]
        .filter((j) => j.failureCount > 0)
        .sort((a, b) => b.failureCount - a.failureCount || b.failureRate - a.failureRate)
        .slice(0, 5);

    return (
        <div className="px-4 pb-3 pt-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {slowestJobs.length > 0 && (
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <Timer className="w-3 h-3 text-blue-400" />
                            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                                Slowest Jobs
                            </span>
                        </div>
                        <div className="space-y-1">
                            {slowestJobs.map((job) => (
                                <InsightRow
                                    key={job.name}
                                    name={job.name}
                                    barPct={Math.max(
                                        (job.avgDurationSeconds / (slowestJobs[0]?.avgDurationSeconds || 1)) * 100,
                                        2
                                    )}
                                    barColor="bg-blue-500/20"
                                >
                                    <span className="text-blue-400 font-medium">
                                        ~{formatDuration(job.avgDurationSeconds)}
                                    </span>
                                    <span className="text-gray-600">
                                        max {formatDuration(job.maxDurationSeconds)}
                                    </span>
                                    <span>{job.totalRuns} runs</span>
                                </InsightRow>
                            ))}
                        </div>
                    </div>
                )}

                {failingSteps.length > 0 ? (
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <XCircle className="w-3 h-3 text-red-400" />
                            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                                Most Failing Steps
                            </span>
                        </div>
                        <div className="space-y-1">
                            {failingSteps.map((step) => (
                                <InsightRow
                                    key={step.name}
                                    name={step.name}
                                    barPct={Math.max((step.failureRate / 100) * 100, 2)}
                                    barColor="bg-red-500/20"
                                >
                                    <span className="text-red-400 font-medium">
                                        {step.failureCount} fail{step.failureCount !== 1 ? "s" : ""}
                                    </span>
                                    <span
                                        className={
                                            step.failureRate >= 20
                                                ? "text-red-400"
                                                : step.failureRate >= 10
                                                  ? "text-yellow-400"
                                                  : "text-gray-500"
                                        }
                                    >
                                        {step.failureRate}%
                                    </span>
                                    <span>{step.totalRuns} runs</span>
                                </InsightRow>
                            ))}
                        </div>
                    </div>
                ) : failingJobs.length > 0 ? (
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <XCircle className="w-3 h-3 text-red-400" />
                            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                                Most Failing Jobs
                            </span>
                        </div>
                        <div className="space-y-1">
                            {failingJobs.map((job) => (
                                <InsightRow
                                    key={job.name}
                                    name={job.name}
                                    barPct={Math.max((job.failureRate / 100) * 100, 2)}
                                    barColor="bg-red-500/20"
                                >
                                    <span className="text-red-400 font-medium">
                                        {job.failureCount} fail{job.failureCount !== 1 ? "s" : ""}
                                    </span>
                                    <span
                                        className={
                                            job.failureRate >= 20
                                                ? "text-red-400"
                                                : job.failureRate >= 10
                                                  ? "text-yellow-400"
                                                  : "text-gray-500"
                                        }
                                    >
                                        {job.failureRate}%
                                    </span>
                                    <span>{job.totalRuns} runs</span>
                                </InsightRow>
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function InsightRow({
    name,
    barPct,
    barColor,
    children
}: {
    name: string;
    barPct: number;
    barColor: string;
    children: React.ReactNode;
}) {
    return (
        <div className="relative p-2 bg-gray-800/30 rounded overflow-hidden">
            <div
                className={`absolute inset-y-0 left-0 ${barColor} transition-all`}
                style={{ width: `${barPct}%` }}
            />
            <div className="relative flex items-center justify-between">
                <span className="text-xs text-gray-300 truncate">{name}</span>
                <div className="flex items-center gap-2 text-[11px] text-gray-500 flex-shrink-0 ml-2">
                    {children}
                </div>
            </div>
        </div>
    );
}

// ── Workflow Stats Panel ─────────────────────────────────────────────────────

interface WorkflowStatsPanelProps {
    stats: WorkflowStat[] | undefined;
    workflows: WorkflowRun[] | undefined;
    insights: WorkflowJobStepInsights | undefined;
    insightsLoading: boolean;
    loading: boolean;
}

export function WorkflowStatsPanel({ stats, workflows, insights, insightsLoading, loading }: WorkflowStatsPanelProps) {
    const owner = useOwner();
    const { repo } = useParams<{ repo: string }>();
    const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);

    // Build sparkline data per workflow name: last 20 runs, showing duration
    const sparklinesByName = useMemo(() => {
        if (!workflows?.length) return new Map<string, { i: number; v: number; c: string }[]>();
        const grouped = new Map<string, WorkflowRun[]>();
        for (const run of workflows) {
            const name = run.workflowName ?? "Unknown";
            let arr = grouped.get(name);
            if (!arr) {
                arr = [];
                grouped.set(name, arr);
            }
            arr.push(run);
        }
        const result = new Map<string, { i: number; v: number; c: string }[]>();
        for (const [name, runs] of grouped) {
            const recent = runs.slice(0, 20).reverse();
            result.set(
                name,
                recent.map((r, i) => ({
                    i,
                    v: r.durationSeconds ?? 0,
                    c: r.conclusion ?? "unknown"
                }))
            );
        }
        return result;
    }, [workflows]);

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
                    {stats.map((stat) => {
                        const filename = stat.workflowPath?.split("/").pop();
                        const ghUrl =
                            filename && repo
                                ? `https://github.com/${owner}/${repo}/actions/workflows/${filename}`
                                : null;
                        const isExpanded = expandedWorkflow === stat.workflowName;

                        return (
                            <div
                                key={stat.workflowName}
                                className="bg-gray-800/50 rounded-lg overflow-hidden"
                            >
                                <button
                                    type="button"
                                    onClick={() =>
                                        setExpandedWorkflow(isExpanded ? null : stat.workflowName)
                                    }
                                    className="w-full flex items-center justify-between p-3 hover:bg-gray-800/80 transition-colors cursor-pointer"
                                >
                                    <div className="min-w-0 flex-1 text-left">
                                        <div className="flex items-center gap-1.5">
                                            <ChevronRight
                                                className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`}
                                            />
                                            <span className="text-sm font-medium text-gray-200 truncate">
                                                {stat.workflowName}
                                            </span>
                                            {ghUrl && (
                                                <a
                                                    href={ghUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-gray-600 hover:text-blue-400 transition-colors"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                </a>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 pl-5">
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
                                        <WorkflowSparkline
                                            data={sparklinesByName.get(stat.workflowName) ?? []}
                                            color={stat.successRate >= 80 ? "#4ade80" : stat.successRate >= 50 ? "#facc15" : "#f87171"}
                                        />
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
                                </button>
                                {isExpanded && (
                                    <div className="border-t border-gray-700/50">
                                        {insightsLoading ? (
                                            <div className="p-4">
                                                <LoadingSkeleton className="h-16 w-full" />
                                            </div>
                                        ) : (
                                            <WorkflowInlineInsights
                                                workflowName={stat.workflowName}
                                                insights={insights}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
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
    workflowInsights?: WorkflowJobStepInsights;
    insightsLoading?: boolean;
}

export function WorkflowList({
    workflows,
    workflowStats,
    loading,
    statsLoading,
    workflowInsights,
    insightsLoading
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
        return (
            <div className="p-12 text-center text-gray-400">
                No workflow runs found. Workflows appear here after CI pipelines run.
            </div>
        );
    }

    return (
        <div>
            <WorkflowStatsPanel
                stats={workflowStats}
                workflows={workflows}
                insights={workflowInsights}
                insightsLoading={insightsLoading ?? false}
                loading={statsLoading}
            />
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
                                    {run.displayTitle ?? run.workflowName ?? "Unknown workflow"}
                                </p>
                                <ConclusionBadge conclusion={run.conclusion} />
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                                {run.displayTitle && run.workflowName && (
                                    <span className="font-medium text-gray-500">
                                        {run.workflowName}
                                    </span>
                                )}
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
