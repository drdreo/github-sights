import React from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ExternalLink, GitBranch, GitFork, Star } from "lucide-react";
import type { Repository } from "../types";

interface RepoCardProps {
    repo: Repository;
    owner: string;
}

export function RepoCard({ repo, owner }: RepoCardProps) {
    return (
        <div className={`group relative bg-gray-900 rounded-xl border border-gray-800 hover:shadow-lg hover:shadow-black/20 hover:border-blue-500/30 transition-all duration-200 flex flex-col h-full ${repo.fork ? "opacity-60" : ""}`}>
            <Link
                to={`/repo/${owner}/${repo.name}`}
                className="flex flex-col flex-grow p-6"
            >
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div
                            className={`p-2 rounded-lg group-hover:bg-blue-500/20 transition-colors flex-shrink-0 ${repo.fork ? "bg-gray-800 text-gray-500" : "bg-blue-500/10 text-blue-400"}`}
                        >
                            {repo.fork ? (
                                <GitFork className="w-5 h-5" />
                            ) : (
                                <GitBranch className="w-5 h-5" />
                            )}
                        </div>
                        <div className="overflow-hidden">
                            <h3 className="font-semibold text-gray-100 group-hover:text-blue-400 transition-colors text-lg truncate">
                                {repo.name}
                            </h3>
                            {repo.fork && <span className="text-xs text-gray-500">Forked</span>}
                        </div>
                    </div>
                    {/* Spacer to keep layout aligned with the external link button */}
                    {repo.html_url && <div className="w-6 h-6 flex-shrink-0" />}
                </div>

                <p className="text-gray-400 text-sm mb-6 line-clamp-2 flex-grow">
                    {repo.description || "No description provided"}
                </p>

                <div className="flex items-center justify-between text-sm text-gray-400 pt-4 border-t border-gray-800 mt-auto">
                    <div className="flex items-center gap-4">
                        {repo.language && (
                            <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                                <span>{repo.language}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-1">
                            <Star className="w-4 h-4" />
                            <span>{repo.stargazers_count}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <GitBranch className="w-4 h-4" />
                            <span>{repo.forks_count}</span>
                        </div>
                    </div>
                    <span className="text-xs text-gray-500">
                        {repo.updated_at && format(new Date(repo.updated_at), "MMM d")}
                    </span>
                </div>
            </Link>
            {repo.html_url && (
                <a
                    href={repo.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute top-5 right-5 text-gray-500 hover:text-gray-300 p-1 rounded-md hover:bg-gray-800 transition-colors z-10"
                >
                    <ExternalLink className="w-4 h-4" />
                </a>
            )}
        </div>
    );
}
