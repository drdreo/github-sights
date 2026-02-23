import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { subDays } from "date-fns";
import { useConfig, useContributorOverview } from "../hooks/useGitHub";
import { ContributorOverview } from "../types";
import { TimeRangeSelector } from "../components/TimeRangeSelector";
import { LoadingSkeleton } from "../components/LoadingSkeleton";

function formatLoc(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

export default function ContributorsPage() {
    const [dateRange, setDateRange] = useState({
        startDate: subDays(new Date(), 30),
        endDate: new Date()
    });

    const { data: config } = useConfig();
    const owner = config?.owner || "";
    
    // Convert dates to ISO strings for the API
    const since = dateRange.startDate.toISOString();
    const until = dateRange.endDate.toISOString();

    const { data: contributors, isLoading } = useContributorOverview(owner, since, until);

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
                            <span className="text-gray-500 font-normal text-xl">/ Contributors</span>
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
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-800/50 text-xs font-medium text-gray-400 uppercase tracking-wider">
                                        <th className="px-6 py-4 font-medium w-16 text-center">#</th>
                                        <th className="px-6 py-4 font-medium">Contributor</th>
                                        <th className="px-6 py-4 font-medium text-right">Commits</th>
                                        <th className="px-6 py-4 font-medium text-right">Lines Added</th>
                                        <th className="px-6 py-4 font-medium text-right">Lines Deleted</th>
                                        <th className="px-6 py-4 font-medium text-right">Repos</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {contributors?.map((contributor: ContributorOverview, index: number) => (
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
                                            <td className="px-6 py-4 text-right">
                                                <div className="group/tooltip relative inline-block">
                                                    <span className="text-gray-300 font-mono text-sm cursor-help border-b border-dotted border-gray-600">
                                                        {contributor.repos.length}
                                                    </span>
                                                    {contributor.repos.length > 0 && (
                                                        <div className="absolute right-0 top-full mt-2 w-48 p-2 bg-gray-800 text-xs text-gray-300 rounded shadow-xl border border-gray-700 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-10 pointer-events-none">
                                                            <div className="font-semibold text-gray-100 mb-1 border-b border-gray-700 pb-1">
                                                                Repositories
                                                            </div>
                                                            <ul className="space-y-1 max-h-32 overflow-y-auto">
                                                                {contributor.repos.slice(0, 10).map((repo: string) => (
                                                                    <li key={repo} className="truncate">• {repo}</li>
                                                                ))}
                                                                {contributor.repos.length > 10 && (
                                                                    <li className="text-gray-500 italic">
                                                                        + {contributor.repos.length - 10} more
                                                                    </li>
                                                                )}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
