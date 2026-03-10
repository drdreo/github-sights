import React from "react";
import { formatLoc } from "../lib/format";

interface LocCellProps {
    value: number;
    type: "addition" | "deletion";
}

/**
 * Reusable cell renderer for lines-of-code values (additions / deletions).
 * Shows a compact formatted number with a tooltip revealing the exact count.
 */
export function LocCell({ value, type }: LocCellProps) {
    const prefix = type === "addition" ? "+" : "-";
    const color = type === "addition" ? "text-green-400" : "text-red-400";

    return (
        <span className={`${color} cursor-default`} title={`${prefix}${value.toLocaleString()}`}>
            {prefix}
            {formatLoc(value)}
        </span>
    );
}
