import React from "react";
import { format } from "date-fns";
import { CheckCircle2, XCircle } from "lucide-react";
import { LoadingSkeleton } from "./LoadingSkeleton";
import type { PullRequest } from "../types";

interface PullRequestListProps {
    pulls: PullRequest[] | undefined;
    loading: boolean;
}

export function PullRequestList({ pulls, loading }: PullRequestListProps) {
    if (loading) {
        return (
            <div className="p-6 space-y-4">
                <LoadingSkeleton className="h-20 w-full" />
                <LoadingSkeleton className="h-20 w-full" />
            </div>
        );
    }

    if (!pulls?.length) {
        return <div className="p-12 text-center text-gray-400">No pull requests found for this repository.</div>;
    }

    return (
        <div className="divide-y divide-gray-800">
            {pulls.map((pr) => (
                <div key={pr.id} className="p-6 hover:bg-gray-800/50 transition-colors flex gap-4">
                    <div className="mt-1 flex-shrink-0">
                        {pr.state === "open" ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : pr.merged_at ? (
                            <CheckCircle2 className="w-5 h-5 text-purple-500" />
                        ) : (
                            <XCircle className="w-5 h-5 text-gray-500" />
                        )}
                    </div>
                    <div className="flex-grow min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-1">
                            <a
                                href={pr.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-semibold text-gray-100 hover:text-blue-400 transition-colors line-clamp-1"
                            >
                                {pr.title}
                            </a>
                            <span
                                className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                    pr.state === "open"
                                        ? "bg-green-500/10 text-green-400 border-green-500/20"
                                        : pr.merged_at
                                          ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                          : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                                }`}
                            >
                                {pr.state === "open" ? "Open" : pr.merged_at ? "Merged" : "Closed"}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span>#{pr.number}</span>
                            <span>•</span>
                            <span>
                                Opened by{" "}
                                <span className="font-medium text-gray-300">{pr.user.login}</span>
                            </span>
                            <span>•</span>
                            <span>{format(new Date(pr.created_at), "MMM d, yyyy")}</span>
                        </div>
                        {pr.additions !== undefined && (
                            <div className="mt-2 flex items-center gap-3 text-xs font-mono">
                                <span className="text-green-400">+{pr.additions}</span>
                                <span className="text-red-400">-{pr.deletions}</span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
