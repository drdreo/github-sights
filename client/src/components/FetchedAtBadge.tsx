import React from "react";
import { Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface FetchedAtBadgeProps {
    fetchedAt: number;
}

export function FetchedAtBadge({ fetchedAt }: FetchedAtBadgeProps) {
    // If fetchedAt is 0 or undefined, don't show anything (or show generic)
    if (!fetchedAt) return null;

    let label = "";
    try {
        label = formatDistanceToNow(new Date(fetchedAt), { addSuffix: true });
    } catch (e) {
        console.error("Invalid date for fetchedAt:", fetchedAt);
        return null;
    }

    return (
        <span 
            className="inline-flex items-center gap-1 text-xs font-normal text-gray-500 bg-gray-800/50 px-2 py-0.5 rounded-full ml-2 select-none"
            title={`Last fetched: ${new Date(fetchedAt).toLocaleString()}`}
        >
            <Clock className="w-3 h-3" />
            {label}
        </span>
    );
}
