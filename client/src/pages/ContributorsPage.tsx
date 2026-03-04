import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { ArrowLeft } from "lucide-react";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { DataTable } from "../components/DataTable";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { TimeRangeSelector } from "../components/TimeRangeSelector";
import { FetchedAtBadge } from "../components/FetchedAtBadge";

import { useContributorOverview } from "../hooks/useGitHub";
import { useOwner } from "../hooks/useOwner";
import { getContributorColumns } from "../lib/contributorColumns";
import { SyncBanner } from "../components/SyncBanner";
import type { ContributorOverview } from "../types";

const columnHelper = createColumnHelper<ContributorOverview>();

const reposColumn = columnHelper.accessor((row) => row.repos.length, {
    id: "repos",
    header: "Repos",
    cell: (info) => {
        const repos = info.row.original.repos;
        return (
            <div className="group/tooltip relative inline-block">
                <span className="text-gray-300 font-mono text-sm cursor-help border-b border-dotted border-gray-600">
                    {repos.length}
                </span>
                {repos.length > 0 && (
                    <div className="absolute right-0 top-full mt-2 w-48 p-2 bg-gray-800 text-xs text-gray-300 rounded shadow-xl border border-gray-700 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-10 pointer-events-none">
                        <div className="font-semibold text-gray-100 mb-1 border-b border-gray-700 pb-1">
                            Repositories
                        </div>
                        <ul className="space-y-1">
                            {repos.slice(0, 10).map((repo: string) => (
                                <li key={repo} className="truncate">
                                    • {repo}
                                </li>
                            ))}
                            {repos.length > 10 && (
                                <li className="text-gray-500 italic">+ {repos.length - 10} more</li>
                            )}
                        </ul>
                    </div>
                )}
            </div>
        );
    },
    sortingFn: "basic",
    meta: { align: "right" as const }
});

// Shared base columns + page-specific repos column
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const columns: ColumnDef<ContributorOverview, any>[] = [
    ...getContributorColumns<ContributorOverview>(),
    reposColumn
];

export default function ContributorsPage() {
    const [dateRange, setDateRange] = useState<{
        startDate: Date | null;
        endDate: Date | null;
    }>({
        startDate: null,
        endDate: null
    });

    const owner = useOwner();

    // Convert dates to ISO strings for the API (null = all time)
    const since = dateRange.startDate?.toISOString() ?? undefined;
    const until = dateRange.endDate?.toISOString() ?? undefined;

    const { data: contributorsResponse, isLoading } = useContributorOverview(owner, since, until);
    const contributors = contributorsResponse?.data;
    const fetchedAt = contributorsResponse?.fetchedAt;


    return (
        <div className="min-h-screen bg-gray-950 p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Back Link */}
                <Link
                    to={`/${owner}/dashboard`}
                    className="inline-flex items-center text-gray-400 hover:text-gray-100 transition-colors gap-2 group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Back to Dashboard
                </Link>

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-100 tracking-tight flex items-center gap-2">
                            {owner}
                            <span className="text-gray-500 font-normal text-xl">
                                / Contributors
                            </span>
                            {fetchedAt && <FetchedAtBadge fetchedAt={fetchedAt} />}
                        </h1>
                        <SyncBanner owner={owner} />
                    </div>
                    <TimeRangeSelector
                        startDate={dateRange.startDate}
                        endDate={dateRange.endDate}
                        onChange={setDateRange}
                        showAllTime
                    />
                </div>

                {/* Content */}
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[...Array(6)].map((_, i) => (
                            <LoadingSkeleton key={i} variant="card" className="h-48" />
                        ))}
                    </div>
                ) : !contributors || contributors.length === 0 ? (
                    <div className="text-center py-20">
                        <p className="text-gray-400 text-lg">No contributor data found</p>
                    </div>
                ) : (
                    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                        <DataTable columns={columns} data={contributors} />
                    </div>
                )}
            </div>
        </div>
    );
}
