import React from "react";
import { formatDistanceToNow } from "date-fns";
import { LoadingSkeleton } from "./LoadingSkeleton";
import type { Commit } from "../types";

interface CommitListProps {
    commits: Commit[] | undefined;
    loading: boolean;
}

export function CommitList({ commits, loading }: CommitListProps) {
    if (loading) {
        return (
            <div className="p-6 space-y-4">
                <LoadingSkeleton variant="timeline" className="h-64" />
            </div>
        );
    }

    if (!commits?.length) {
        return (
            <div className="p-12 text-center text-gray-400">
                No commits found in the last 90 days.
            </div>
        );
    }

    return (
        <div className="divide-y divide-gray-800">
            {commits.map((commit) => (
                <div
                    key={commit.sha}
                    className="group p-6 hover:bg-gray-800/50 transition-colors flex gap-4 items-start"
                >
                    <div className="mt-1 flex-shrink-0">
                        <img
                            src={commit.author.avatar_url || "https://github.com/ghost.png"}
                            alt=""
                            className="w-10 h-10 rounded-full border border-gray-700 bg-gray-800"
                        />
                    </div>
                    <div className="flex-grow min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-1">
                            <a
                                href={commit.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-semibold text-gray-100 line-clamp-1 group-hover:text-blue-400 transition-colors cursor-pointer"
                            >
                                {commit.message}
                            </a>
                            <a
                                href={commit.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 font-mono text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded border border-gray-700 group-hover:border-blue-500/30 group-hover:text-blue-400 transition-all"
                            >
                                {commit.sha.substring(0, 7)}
                            </a>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span className="font-medium text-gray-300">{commit.author.name}</span>
                            <span>
                                committed {formatDistanceToNow(new Date(commit.author.date))} ago
                            </span>
                            {commit.stats && (
                                <div className="flex items-center gap-3 font-mono">
                                    <span className="text-green-400">
                                        +{commit.stats.additions}
                                    </span>
                                    <span className="text-red-400">-{commit.stats.deletions}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
