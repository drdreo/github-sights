import React from "react";
import { formatDistanceToNow } from "date-fns";
import {
    Star,
    GitBranch,
    ExternalLink,
    Clock,
    AlertCircle,
    GitCommit,
    GitPullRequest,
    GitMerge,
    Users,
    Code
} from "lucide-react";
import type { Repository, Commit, PullRequest, RepoContributorStat } from "../types";
import { getLanguageColor } from "../lib/languageColors";

function formatCompact(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toString();
}

interface RepoHeaderProps {
    repository: Repository;
    commits?: Commit[];
    pulls?: PullRequest[];
    contributors?: RepoContributorStat[];
}

export function RepoHeader({ repository, commits, pulls, contributors }: RepoHeaderProps) {
    const totalCommits = commits?.length ?? 0;
    const totalPRs = pulls?.length ?? 0;
    const mergedPRs = pulls?.filter((pr) => pr.merged_at).length ?? 0;
    const totalContributors = contributors?.length ?? 0;
    const totalAdditions = commits?.reduce((sum, c) => sum + (c.stats?.additions ?? 0), 0) ?? 0;
    const totalDeletions = commits?.reduce((sum, c) => sum + (c.stats?.deletions ?? 0), 0) ?? 0;

    return (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                <GitBranch className="w-64 h-64 text-gray-100 transform rotate-12 translate-x-16 -translate-y-8" />
            </div>

            <div className="relative z-10">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-3xl font-bold text-gray-100 tracking-tight">
                                {repository.name}
                            </h1>
                            <span className="bg-gray-800 text-gray-400 text-xs px-2.5 py-1 rounded-full border border-gray-700 font-medium">
                                {repository.private ? "Private" : "Public"}
                            </span>
                        </div>
                        <p className="text-gray-400 max-w-2xl text-lg leading-relaxed">
                            {repository.description || "No description provided."}
                        </p>
                    </div>

                    <a
                        href={repository.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-900 rounded-lg hover:bg-white transition-all shadow-lg shadow-black/20 hover:shadow-black/30 font-medium"
                    >
                        View on GitHub
                        <ExternalLink className="w-4 h-4" />
                    </a>
                </div>

                <div className="flex flex-wrap items-center gap-4 mt-8 text-sm">
                    {repository.language && (
                        <div className="flex items-center gap-2">
                            <span
                                className="w-3 h-3 rounded-full shadow-sm"
                                style={{
                                    backgroundColor: getLanguageColor(repository.language),
                                    boxShadow: `0 1px 2px ${getLanguageColor(repository.language)}80`
                                }}
                            />
                            <span className="font-medium text-gray-300">{repository.language}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-1.5 bg-gray-800 px-3 py-1.5 rounded-md border border-gray-700">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        <span className="font-semibold text-gray-100">
                            {formatCompact(repository.stargazers_count)}
                        </span>
                        <span className="text-gray-500">stars</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-gray-800 px-3 py-1.5 rounded-md border border-gray-700">
                        <GitBranch className="w-4 h-4 text-purple-500" />
                        <span className="font-semibold text-gray-100">
                            {formatCompact(repository.forks_count)}
                        </span>
                        <span className="text-gray-500">forks</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-gray-800 px-3 py-1.5 rounded-md border border-gray-700">
                        <AlertCircle className="w-4 h-4 text-green-500" />
                        <span className="font-semibold text-gray-100">
                            {formatCompact(repository.open_issues_count)}
                        </span>
                        <span className="text-gray-500">issues</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-gray-800 px-3 py-1.5 rounded-md border border-gray-700">
                        <GitCommit className="w-4 h-4 text-blue-400" />
                        <span className="font-semibold text-gray-100">
                            {formatCompact(totalCommits)}
                        </span>
                        <span className="text-gray-500">commits</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-gray-800 px-3 py-1.5 rounded-md border border-gray-700">
                        <GitPullRequest className="w-4 h-4 text-cyan-400" />
                        <span className="font-semibold text-gray-100">
                            {formatCompact(totalPRs)}
                        </span>
                        <span className="text-gray-500">PRs</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-gray-800 px-3 py-1.5 rounded-md border border-gray-700">
                        <GitMerge className="w-4 h-4 text-purple-400" />
                        <span className="font-semibold text-gray-100">
                            {formatCompact(mergedPRs)}
                        </span>
                        <span className="text-gray-500">merged</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-gray-800 px-3 py-1.5 rounded-md border border-gray-700">
                        <Users className="w-4 h-4 text-orange-400" />
                        <span className="font-semibold text-gray-100">
                            {formatCompact(totalContributors)}
                        </span>
                        <span className="text-gray-500">contributors</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-gray-800 px-3 py-1.5 rounded-md border border-gray-700">
                        <Code className="w-4 h-4 text-green-400" />
                        <span className="font-semibold text-green-400">
                            +{formatCompact(totalAdditions)}
                        </span>
                        <span className="text-gray-600">/</span>
                        <span className="font-semibold text-red-400">
                            -{formatCompact(totalDeletions)}
                        </span>
                    </div>
                    <div className="ml-auto text-gray-500 flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        Last updated {formatDistanceToNow(new Date(repository.updated_at))} ago
                    </div>
                </div>
            </div>
        </div>
    );
}
