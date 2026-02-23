import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    type Header,
    type SortingState,
    useReactTable
} from "@tanstack/react-table";
import { subDays } from "date-fns";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown } from "lucide-react";
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { TimeRangeSelector } from "../components/TimeRangeSelector";
import { useConfig, useContributorOverview } from "../hooks/useGitHub";
import { ContributorOverview } from "../types";

function formatLoc(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

function SortIcon({ header }: { header: Header<ContributorOverview, unknown> }) {
    const sorted = header.column.getIsSorted();
    if (!sorted) {
        return <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />;
    }
    return sorted === "asc" ? (
        <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
    ) : (
        <ArrowDown className="w-3.5 h-3.5 text-blue-400" />
    );
}

const columnHelper = createColumnHelper<ContributorOverview>();

export default function ContributorsPage() {
    const [dateRange, setDateRange] = useState({
        startDate: subDays(new Date(), 30),
        endDate: new Date()
    });
    const [sorting, setSorting] = useState<SortingState>([]);

    const { data: config } = useConfig();
    const owner = config?.owner || "";

    // Convert dates to ISO strings for the API
    const since = dateRange.startDate.toISOString();
    const until = dateRange.endDate.toISOString();

    const { data: contributors, isLoading } = useContributorOverview(owner, since, until);

    const columns = useMemo(
        () => [
            columnHelper.display({
                id: "rank",
                header: "#",
                cell: (info) => info.row.index + 1
            }),
            columnHelper.accessor("login", {
                header: "Contributor",
                cell: (info) => {
                    const row = info.row.original;
                    return (
                        <div className="flex items-center gap-3">
                            <img
                                src={row.avatar_url}
                                alt={row.login}
                                className="w-8 h-8 rounded-full bg-gray-800 ring-2 ring-gray-800 group-hover:ring-gray-700 transition-all"
                            />
                            <a
                                href={row.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-100 hover:text-blue-400 font-medium transition-colors"
                            >
                                {row.login}
                            </a>
                        </div>
                    );
                },
                sortingFn: "text"
            }),
            columnHelper.accessor("totalCommits", {
                header: "Commits",
                cell: (info) => info.getValue().toLocaleString(),
                sortingFn: "basic"
            }),
            columnHelper.accessor("totalAdditions", {
                header: "Lines Added",
                cell: (info) => `+${formatLoc(info.getValue())}`,
                sortingFn: "basic"
            }),
            columnHelper.accessor("totalDeletions", {
                header: "Lines Deleted",
                cell: (info) => `-${formatLoc(info.getValue())}`,
                sortingFn: "basic"
            }),
            columnHelper.accessor((row) => row.repos.length, {
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
                                            <li className="text-gray-500 italic">
                                                + {repos.length - 10} more
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            )}
                        </div>
                    );
                },
                sortingFn: "basic"
            })
        ],
        []
    );

    const table = useReactTable({
        data: contributors ?? [],
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel()
    });

    // Column alignment: right-align numeric columns
    const rightAlignedColumns = new Set([
        "totalCommits",
        "totalAdditions",
        "totalDeletions",
        "repos"
    ]);
    const centerAlignedColumns = new Set(["rank"]);

    return (
        <div className="min-h-screen bg-gray-950 p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Back Link */}
                <Link
                    to="/dashboard"
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
                        </h1>
                    </div>
                    <TimeRangeSelector
                        startDate={dateRange.startDate}
                        endDate={dateRange.endDate}
                        onChange={setDateRange}
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
                        <table className="w-full text-left border-collapse">
                            <thead>
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <tr
                                        key={headerGroup.id}
                                        className="bg-gray-800/50 text-xs font-medium text-gray-400 uppercase tracking-wider"
                                    >
                                        {headerGroup.headers.map((header) => {
                                            const isRight = rightAlignedColumns.has(
                                                header.column.id
                                            );
                                            const isCenter = centerAlignedColumns.has(
                                                header.column.id
                                            );
                                            const canSort = header.column.getCanSort();
                                            return (
                                                <th
                                                    key={header.id}
                                                    className={`px-6 py-4 font-medium ${isCenter ? "w-16 text-center" : ""} ${isRight ? "text-right" : ""} ${canSort ? "cursor-pointer select-none hover:text-gray-200 transition-colors" : ""}`}
                                                    onClick={header.column.getToggleSortingHandler()}
                                                >
                                                    <div
                                                        className={`inline-flex items-center gap-1.5 ${isRight ? "flex-row-reverse" : ""}`}
                                                    >
                                                        {flexRender(
                                                            header.column.columnDef.header,
                                                            header.getContext()
                                                        )}
                                                        {canSort && <SortIcon header={header} />}
                                                    </div>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {table.getRowModel().rows.map((row) => (
                                    <tr
                                        key={row.id}
                                        className="hover:bg-gray-800/30 transition-colors group"
                                    >
                                        {row.getVisibleCells().map((cell) => {
                                            const isRight = rightAlignedColumns.has(cell.column.id);
                                            const isCenter = centerAlignedColumns.has(
                                                cell.column.id
                                            );
                                            const isAdditions = cell.column.id === "totalAdditions";
                                            const isDeletions = cell.column.id === "totalDeletions";
                                            return (
                                                <td
                                                    key={cell.id}
                                                    className={`px-6 py-4 ${isCenter ? "text-center text-gray-500" : ""} ${isRight && !isAdditions && !isDeletions ? "text-right text-gray-300" : ""} ${isAdditions ? "text-right text-green-400" : ""} ${isDeletions ? "text-right text-red-400" : ""} ${isRight || isCenter ? "font-mono text-sm" : ""}`}
                                                >
                                                    {flexRender(
                                                        cell.column.columnDef.cell,
                                                        cell.getContext()
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
