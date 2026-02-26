import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import React from "react";
import type { RepoContributorStat } from "../types";
import { formatLoc } from "./format";

/**
 * Shared contributor column definitions.
 * Generic over any type extending RepoContributorStat so the returned
 * columns are assignable to ColumnDef<T> (e.g. ContributorOverview).
 * Consumers can spread these and append extra columns.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getContributorColumns<T extends RepoContributorStat>(): ColumnDef<T, any>[] {
    const col = createColumnHelper<T>();

    return [
        col.display({
            id: "rank",
            header: "#",
            cell: (info) => info.row.index + 1,
            meta: { align: "center" as const }
        }),
        col.accessor((row) => row.login, {
            id: "login",
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
        col.accessor((row) => row.totalCommits, {
            id: "totalCommits",
            header: "Commits",
            cell: (info) => info.getValue().toLocaleString(),
            sortingFn: "basic",
            meta: { align: "right" as const }
        }),
        col.accessor((row) => row.totalAdditions, {
            id: "totalAdditions",
            header: "Lines Added",
            cell: (info) => `+${formatLoc(info.getValue())}`,
            sortingFn: "basic",
            meta: { align: "right" as const, cellClassName: "text-green-400" }
        }),
        col.accessor((row) => row.totalDeletions, {
            id: "totalDeletions",
            header: "Lines Deleted",
            cell: (info) => `-${formatLoc(info.getValue())}`,
            sortingFn: "basic",
            meta: { align: "right" as const, cellClassName: "text-red-400" }
        }),
        col.accessor((row) => row.totalAdditions - row.totalDeletions, {
            id: "delta",
            header: "Delta",
            cell: (info) => {
                const value = info.getValue();
                const prefix = value >= 0 ? "+" : "";
                const color =
                    value > 0 ? "text-blue-400" : value < 0 ? "text-yellow-400" : "text-gray-400";
                return <span className={color}>{`${prefix}${formatLoc(value)}`}</span>;
            },
            sortingFn: "basic",
            meta: {
                align: "right" as const
            }
        })
    ];
}
