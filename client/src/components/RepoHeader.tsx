import React from "react";
import { formatDistanceToNow } from "date-fns";
import { Star, GitBranch, ExternalLink, Clock, AlertCircle } from "lucide-react";
import type { Repository } from "../types";
import { getLanguageColor } from "../lib/languageColors";

interface RepoHeaderProps {
    repository: Repository;
}

export function RepoHeader({ repository }: RepoHeaderProps) {
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

                <div className="flex flex-wrap items-center gap-6 mt-8 text-sm">
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
                    <div className="flex items-center gap-1.5 text-gray-400 bg-gray-800 px-3 py-1.5 rounded-md border border-gray-700">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        <span className="font-semibold text-gray-100">
                            {repository.stargazers_count}
                        </span>
                        <span className="text-gray-500">stars</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-400 bg-gray-800 px-3 py-1.5 rounded-md border border-gray-700">
                        <GitBranch className="w-4 h-4 text-purple-500" />
                        <span className="font-semibold text-gray-100">
                            {repository.forks_count}
                        </span>
                        <span className="text-gray-500">forks</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-400 bg-gray-800 px-3 py-1.5 rounded-md border border-gray-700">
                        <AlertCircle className="w-4 h-4 text-green-500" />
                        <span className="font-semibold text-gray-100">
                            {repository.open_issues_count}
                        </span>
                        <span className="text-gray-500">issues</span>
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
