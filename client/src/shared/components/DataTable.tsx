import {
    type ColumnDef,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    type RowData,
    type SortingState,
    useReactTable
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import React, { useState } from "react";

// ── Column meta augmentation ────────────────────────────────────────
declare module "@tanstack/react-table" {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface ColumnMeta<TData extends RowData, TValue> {
        /** Column content alignment (default: left) */
        align?: "left" | "center" | "right";
        /** Extra Tailwind classes appended to header <th> */
        headerClassName?: string;
        /** Extra Tailwind classes appended to body <td> */
        cellClassName?: string;
    }
}

// ── Internal helpers ────────────────────────────────────────────────
function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
    if (!sorted) {
        return <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />;
    }
    return sorted === "asc" ? (
        <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
    ) : (
        <ArrowDown className="w-3.5 h-3.5 text-blue-400" />
    );
}

// ── Component ───────────────────────────────────────────────────────
interface DataTableProps<TData> {
    /** Column definitions (use createColumnHelper<TData>() to build) */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    columns: ColumnDef<TData, any>[];
    /** Row data */
    data: TData[];
    /** Optional initial sorting state */
    initialSorting?: SortingState;
    /** When set, shows a search input above the table with this placeholder text */
    searchPlaceholder?: string;
}

export function DataTable<TData>({
    columns,
    data,
    initialSorting = [],
    searchPlaceholder
}: DataTableProps<TData>) {
    const [sorting, setSorting] = useState<SortingState>(initialSorting);
    const [globalFilter, setGlobalFilter] = useState("");

    const table = useReactTable({
        data,
        columns,
        state: { sorting, globalFilter },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel()
    });

    return (
        <div>
            {searchPlaceholder && (
                <div className="px-6 py-4 border-b border-gray-800">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            value={globalFilter}
                            onChange={(e) => setGlobalFilter(e.target.value)}
                            placeholder={searchPlaceholder}
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder:text-gray-500 focus:bg-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all duration-200"
                        />
                    </div>
                </div>
            )}
            <table className="w-full text-left border-collapse">
                <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <tr
                            key={headerGroup.id}
                            className="bg-gray-800/50 text-xs font-medium text-gray-400 uppercase tracking-wider"
                        >
                            {headerGroup.headers.map((header) => {
                                const meta = header.column.columnDef.meta;
                                const align = meta?.align ?? "left";
                                const canSort = header.column.getCanSort();
                                return (
                                    <th
                                        key={header.id}
                                        className={[
                                            "px-6 py-4 font-medium",
                                            align === "center" && "w-16 text-center",
                                            align === "right" && "text-right",
                                            canSort &&
                                                "cursor-pointer select-none hover:text-gray-200 transition-colors",
                                            meta?.headerClassName
                                        ]
                                            .filter(Boolean)
                                            .join(" ")}
                                        onClick={header.column.getToggleSortingHandler()}
                                    >
                                        <div
                                            className={`inline-flex items-center gap-1.5 ${align === "right" ? "flex-row-reverse" : ""}`}
                                        >
                                            {flexRender(
                                                header.column.columnDef.header,
                                                header.getContext()
                                            )}
                                            {canSort && (
                                                <SortIcon sorted={header.column.getIsSorted()} />
                                            )}
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    ))}
                </thead>
                <tbody className="divide-y divide-gray-800">
                    {table.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-800/30 transition-colors group">
                            {row.getVisibleCells().map((cell) => {
                                const meta = cell.column.columnDef.meta;
                                const align = meta?.align ?? "left";
                                return (
                                    <td
                                        key={cell.id}
                                        className={[
                                            "px-6 py-4",
                                            align === "center" && "text-center text-gray-500",
                                            align === "right" && "text-right text-gray-300",
                                            (align === "right" || align === "center") &&
                                                "font-mono text-sm",
                                            meta?.cellClassName
                                        ]
                                            .filter(Boolean)
                                            .join(" ")}
                                    >
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
