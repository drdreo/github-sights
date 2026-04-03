import React, { useState } from "react";
import { ChevronDown, Timer, XCircle } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { LoadingSkeleton } from "./LoadingSkeleton";
import type { WorkflowJobStepInsights, JobInsight } from "../types";

function formatDuration(seconds: number | null): string {
    if (seconds == null || seconds === 0) return "-";
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
}

interface WorkflowInsightsPanelProps {
    insights: WorkflowJobStepInsights | undefined;
    loading: boolean;
}

export function WorkflowInsightsPanel({ insights, loading }: WorkflowInsightsPanelProps) {
    const [open, setOpen] = useState(true);

    if (loading) {
        return (
            <div className="border-b border-gray-800 p-6">
                <LoadingSkeleton className="h-24 w-full" />
            </div>
        );
    }

    if (!insights?.jobs.length && !insights?.steps.length) {
        return null;
    }

    const slowestJobs = [...(insights?.jobs ?? [])]
        .sort((a, b) => b.avgDurationSeconds - a.avgDurationSeconds)
        .slice(0, 5);

    const mostFailingSteps = [...(insights?.steps ?? [])]
        .filter((s) => s.failureCount > 0)
        .sort((a, b) => b.failureCount - a.failureCount || b.failureRate - a.failureRate)
        .slice(0, 5);

    // Also show most failing jobs if there are failures
    const mostFailingJobs = [...(insights?.jobs ?? [])]
        .filter((j) => j.failureCount > 0)
        .sort((a, b) => b.failureCount - a.failureCount || b.failureRate - a.failureRate)
        .slice(0, 5);

    if (slowestJobs.length === 0 && mostFailingSteps.length === 0 && mostFailingJobs.length === 0) {
        return null;
    }

    return (
        <div className="border-b border-gray-800">
            <Collapsible.Root open={open} onOpenChange={setOpen}>
                <Collapsible.Trigger className="w-full flex items-center justify-between p-6 hover:bg-gray-800/30 transition-colors cursor-pointer">
                    <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                        Job & Step Insights
                    </h4>
                    <ChevronDown
                        className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
                    />
                </Collapsible.Trigger>
                <Collapsible.Content className="px-6 pb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Slowest Jobs */}
                        {slowestJobs.length > 0 && (
                            <InsightList
                                title="Slowest Jobs"
                                icon={<Timer className="w-3.5 h-3.5 text-blue-400" />}
                                items={slowestJobs}
                                renderItem={(job) => (
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-gray-200 truncate">{job.name}</span>
                                        <div className="flex items-center gap-3 text-xs text-gray-400 flex-shrink-0 ml-3">
                                            <span className="text-blue-400 font-medium">
                                                ~{formatDuration(job.avgDurationSeconds)}
                                            </span>
                                            <span className="text-gray-500">
                                                max {formatDuration(job.maxDurationSeconds)}
                                            </span>
                                            <span>{job.totalRuns} runs</span>
                                        </div>
                                    </div>
                                )}
                                barValue={(job) => job.avgDurationSeconds}
                                barMax={slowestJobs[0]?.avgDurationSeconds ?? 1}
                                barColor="bg-blue-500/30"
                            />
                        )}

                        {/* Most Failing — prefer steps, fall back to jobs */}
                        {mostFailingSteps.length > 0 ? (
                            <InsightList
                                title="Most Failing Steps"
                                icon={<XCircle className="w-3.5 h-3.5 text-red-400" />}
                                items={mostFailingSteps}
                                renderItem={(step) => (
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-gray-200 truncate">{step.name}</span>
                                        <div className="flex items-center gap-3 text-xs text-gray-400 flex-shrink-0 ml-3">
                                            <span className="text-red-400 font-medium">
                                                {step.failureCount} fail{step.failureCount !== 1 ? "s" : ""}
                                            </span>
                                            <span className={step.failureRate >= 20 ? "text-red-400" : step.failureRate >= 10 ? "text-yellow-400" : "text-gray-400"}>
                                                {step.failureRate}%
                                            </span>
                                            <span>{step.totalRuns} runs</span>
                                        </div>
                                    </div>
                                )}
                                barValue={(step) => step.failureRate}
                                barMax={100}
                                barColor="bg-red-500/30"
                            />
                        ) : mostFailingJobs.length > 0 ? (
                            <InsightList
                                title="Most Failing Jobs"
                                icon={<XCircle className="w-3.5 h-3.5 text-red-400" />}
                                items={mostFailingJobs}
                                renderItem={(job) => (
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-gray-200 truncate">{job.name}</span>
                                        <div className="flex items-center gap-3 text-xs text-gray-400 flex-shrink-0 ml-3">
                                            <span className="text-red-400 font-medium">
                                                {job.failureCount} fail{job.failureCount !== 1 ? "s" : ""}
                                            </span>
                                            <span className={job.failureRate >= 20 ? "text-red-400" : job.failureRate >= 10 ? "text-yellow-400" : "text-gray-400"}>
                                                {job.failureRate}%
                                            </span>
                                            <span>{job.totalRuns} runs</span>
                                        </div>
                                    </div>
                                )}
                                barValue={(job) => job.failureRate}
                                barMax={100}
                                barColor="bg-red-500/30"
                            />
                        ) : null}
                    </div>
                </Collapsible.Content>
            </Collapsible.Root>
        </div>
    );
}

// ── Generic insight list ────────────────────────────────────────────────────

interface InsightListProps {
    title: string;
    icon: React.ReactNode;
    items: JobInsight[];
    renderItem: (item: JobInsight) => React.ReactNode;
    barValue: (item: JobInsight) => number;
    barMax: number;
    barColor: string;
}

function InsightList({ title, icon, items, renderItem, barValue, barMax, barColor }: InsightListProps) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                {icon}
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {title}
                </span>
            </div>
            <div className="space-y-2">
                {items.map((item) => (
                    <div key={item.name} className="relative p-2.5 bg-gray-800/50 rounded-lg overflow-hidden">
                        <div
                            className={`absolute inset-y-0 left-0 ${barColor} transition-all`}
                            style={{ width: `${Math.max((barValue(item) / barMax) * 100, 2)}%` }}
                        />
                        <div className="relative">{renderItem(item)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
