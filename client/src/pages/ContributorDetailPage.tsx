import React, { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, AlertCircle, ExternalLink } from "lucide-react";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid
} from "recharts";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { format } from "date-fns";

import { useContributorDetail } from "../hooks/useGitHub";
import { useOwner } from "../hooks/useOwner";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { DataTable } from "../components/DataTable";
import { TimeRangeSelector } from "../components/TimeRangeSelector";
import { formatLoc } from "../lib/format";
import { LocCell } from "../components/LocCell";
import type { ContributorDetail } from "../types";

type RepoBreakdownRow = ContributorDetail["repoBreakdown"][number];

const columnHelper = createColumnHelper<RepoBreakdownRow>();

function useRepoBreakdownColumns(owner: string): ColumnDef<RepoBreakdownRow, unknown>[] {
    return useMemo(
        () =>
            [
                columnHelper.accessor("repo", {
                    header: "Repository",
                    cell: (info) => (
                        <Link
                            to={`/${owner}/repo/${info.getValue()}`}
                            className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                        >
                            {info.getValue()}
                        </Link>
                    ),
                    sortingFn: "text"
                }),
                columnHelper.accessor("commits", {
                    header: "Commits",
                    cell: (info) => info.getValue().toLocaleString(),
                    sortingFn: "basic",
                    meta: { align: "right" as const }
                }),
                columnHelper.accessor("prs", {
                    header: "PRs",
                    cell: (info) => info.getValue().toLocaleString(),
                    sortingFn: "basic",
                    meta: { align: "right" as const }
                }),
                columnHelper.accessor("prsMerged", {
                    header: "PRs Merged",
                    cell: (info) => info.getValue().toLocaleString(),
                    sortingFn: "basic",
                    meta: { align: "right" as const }
                }),
                columnHelper.accessor("additions", {
                    header: "Lines Added",
                    cell: (info) => <LocCell value={info.getValue()} type="addition" />,
                    sortingFn: "basic",
                    meta: { align: "right" as const }
                }),
                columnHelper.accessor("deletions", {
                    header: "Lines Deleted",
                    cell: (info) => <LocCell value={info.getValue()} type="deletion" />,
                    sortingFn: "basic",
                    meta: { align: "right" as const }
                })
            ] as ColumnDef<RepoBreakdownRow, unknown>[],
        [owner]
    );
}

function StatBadge({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg px-4 py-3">
            <div className="text-xs text-gray-400 mb-1">{label}</div>
            <div className="text-lg font-semibold text-gray-100">{value}</div>
        </div>
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ActivityTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
        <div className="bg-gray-900/95 border border-gray-700 rounded-lg px-3 py-2 shadow-xl text-xs">
            <p className="text-gray-300 mb-1">{label}</p>
            <p className="text-gray-100">Commits: {d.commits}</p>
            <p className="font-mono">
                <span className="text-green-400">+{d.additions}</span>{" "}
                <span className="text-red-400">-{d.deletions}</span>
            </p>
            {(d.prsOpened > 0 || d.prsMerged > 0) && (
                <p className="text-gray-300 mt-1">
                    PRs opened: {d.prsOpened} / merged: {d.prsMerged}
                </p>
            )}
        </div>
    );
}

export default function ContributorDetailPage() {
    const owner = useOwner();
    const { login: paramLogin } = useParams<{ login: string }>();
    const login = paramLogin || "";

    const [dateRange, setDateRange] = useState<{
        startDate: Date | null;
        endDate: Date | null;
    }>({ startDate: null, endDate: null });

    const since = dateRange.startDate?.toISOString() ?? undefined;
    const until = dateRange.endDate?.toISOString() ?? undefined;

    const { data: contributor, isLoading } = useContributorDetail(owner, login, since, until);

    const columns = useRepoBreakdownColumns(owner);

    const chartData = useMemo(() => {
        if (!contributor?.dailyActivity) return [];
        return contributor.dailyActivity.map((d) => ({
            ...d,
            displayDate: format(new Date(d.date), "MMM d")
        }));
    }, [contributor?.dailyActivity]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-950 p-8">
                <div className="max-w-7xl mx-auto space-y-8">
                    <LoadingSkeleton variant="text" className="w-40" />
                    <div className="flex items-center gap-6">
                        <LoadingSkeleton variant="circle" className="w-20 h-20" />
                        <div className="space-y-2 flex-1">
                            <LoadingSkeleton variant="text" className="w-48 h-8" />
                            <LoadingSkeleton variant="text" className="w-32" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[...Array(8)].map((_, i) => (
                            <LoadingSkeleton key={i} variant="card" className="h-20" />
                        ))}
                    </div>
                    <LoadingSkeleton variant="timeline" className="h-64" />
                </div>
            </div>
        );
    }

    if (!contributor) {
        return (
            <div className="p-8 flex flex-col items-center justify-center h-screen text-center">
                <AlertCircle className="w-16 h-16 text-gray-600 mb-4" />
                <h1 className="text-2xl font-bold text-gray-100">Contributor not found</h1>
                <Link to={`/${owner}/contributors`} className="mt-4 text-blue-400 hover:underline">
                    Return to Contributors
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 p-8">
            <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
                {/* Back Link */}
                <Link
                    to={`/${owner}/contributors`}
                    className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-100 transition-colors font-medium group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Back to Contributors
                </Link>

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-6">
                        <img
                            src={contributor.avatar_url}
                            alt={contributor.login}
                            className="w-20 h-20 rounded-full ring-4 ring-gray-800"
                        />
                        <div>
                            <h1 className="text-3xl font-bold text-gray-100 tracking-tight">
                                {contributor.login}
                            </h1>
                            <a
                                href={contributor.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-blue-400 transition-colors mt-1"
                            >
                                View on GitHub
                                <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    </div>
                    <TimeRangeSelector
                        startDate={dateRange.startDate}
                        endDate={dateRange.endDate}
                        onChange={setDateRange}
                        showAllTime
                    />
                </div>

                {/* Stat Badges */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatBadge
                        label="Total Commits"
                        value={contributor.totalCommits.toLocaleString()}
                    />
                    <StatBadge label="Total PRs" value={contributor.totalPRs.toLocaleString()} />
                    <StatBadge
                        label="PRs Merged"
                        value={contributor.totalPRsMerged.toLocaleString()}
                    />
                    <StatBadge
                        label="Active Days"
                        value={contributor.activeDays.toLocaleString()}
                    />
                    <StatBadge
                        label="Lines Added"
                        value={`+${formatLoc(contributor.totalAdditions)}`}
                    />
                    <StatBadge
                        label="Lines Deleted"
                        value={`-${formatLoc(contributor.totalDeletions)}`}
                    />
                    <StatBadge
                        label="First Commit"
                        value={
                            contributor.firstCommitAt
                                ? format(new Date(contributor.firstCommitAt), "MMM d, yyyy")
                                : "N/A"
                        }
                    />
                    <StatBadge
                        label="Last Commit"
                        value={
                            contributor.lastCommitAt
                                ? format(new Date(contributor.lastCommitAt), "MMM d, yyyy")
                                : "N/A"
                        }
                    />
                </div>

                {/* Activity Chart */}
                {chartData.length > 0 && (
                    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                        <h2 className="text-lg font-semibold text-gray-100 mb-4">Daily Activity</h2>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart
                                    data={chartData}
                                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                >
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        vertical={false}
                                        stroke="#374151"
                                    />
                                    <XAxis
                                        dataKey="displayDate"
                                        stroke="#4b5563"
                                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                                        tickLine={{ stroke: "#4b5563" }}
                                        axisLine={{ stroke: "#4b5563" }}
                                        minTickGap={30}
                                    />
                                    <YAxis
                                        stroke="#4b5563"
                                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                                        tickLine={{ stroke: "#4b5563" }}
                                        axisLine={{ stroke: "#4b5563" }}
                                        allowDecimals={false}
                                    />
                                    <Tooltip
                                        content={<ActivityTooltip />}
                                        cursor={{
                                            stroke: "#6b7280",
                                            strokeWidth: 1,
                                            strokeDasharray: "4 4"
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="commits"
                                        stroke="#3b82f6"
                                        fill="#3b82f6"
                                        fillOpacity={0.15}
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 4, strokeWidth: 0 }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* Repository Breakdown */}
                {contributor.repoBreakdown.length > 0 && (
                    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-800">
                            <h2 className="text-lg font-semibold text-gray-100">
                                Repository Breakdown
                            </h2>
                        </div>
                        <DataTable columns={columns} data={contributor.repoBreakdown} />
                    </div>
                )}
            </div>
        </div>
    );
}
