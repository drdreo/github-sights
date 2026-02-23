import React from "react";
import { LoadingSkeleton } from "./LoadingSkeleton";
import type { RepoContributorStat } from "../types";

function formatLoc(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

interface ContributorGridProps {
    contributors: RepoContributorStat[] | undefined;
    loading: boolean;
}

export function ContributorGrid({ contributors, loading }: ContributorGridProps) {
    if (loading) {
        return (
            <div className="p-6 space-y-3">
                {[...Array(5)].map((_, i) => (
                    <LoadingSkeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
            </div>
        );
    }

    if (!contributors?.length) {
        return <div className="p-12 text-center text-gray-400">No contributors found.</div>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-gray-800/50 text-xs font-medium text-gray-400 uppercase tracking-wider">
                        <th className="px-6 py-4 font-medium w-16 text-center">#</th>
                        <th className="px-6 py-4 font-medium">Contributor</th>
                        <th className="px-6 py-4 font-medium text-right">Commits</th>
                        <th className="px-6 py-4 font-medium text-right">Lines Added</th>
                        <th className="px-6 py-4 font-medium text-right">Lines Deleted</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                    {contributors.map((contributor, index) => (
                        <tr
                            key={contributor.login}
                            className="hover:bg-gray-800/30 transition-colors group"
                        >
                            <td className="px-6 py-4 text-center text-gray-500 text-sm font-mono">
                                {index + 1}
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <img
                                        src={contributor.avatar_url}
                                        alt={contributor.login}
                                        className="w-8 h-8 rounded-full bg-gray-800 ring-2 ring-gray-800 group-hover:ring-gray-700 transition-all"
                                    />
                                    <a
                                        href={contributor.html_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-gray-100 hover:text-blue-400 font-medium transition-colors"
                                    >
                                        {contributor.login}
                                    </a>
                                </div>
                            </td>
                            <td className="px-6 py-4 text-right text-gray-300 font-mono text-sm">
                                {contributor.totalCommits.toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-right text-green-400 font-mono text-sm">
                                +{formatLoc(contributor.totalAdditions)}
                            </td>
                            <td className="px-6 py-4 text-right text-red-400 font-mono text-sm">
                                -{formatLoc(contributor.totalDeletions)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
