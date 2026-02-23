import React from "react";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { RepoCard } from "./RepoCard";
import type { Repository } from "../types";

interface RepoGridProps {
    repos: Repository[];
    owner: string;
    loading: boolean;
    commitCounts?: Map<string, number>;
}

export function RepoGrid({ repos, owner, loading, commitCounts }: RepoGridProps) {
    return (
        <div>
            <h2 className="text-xl font-semibold text-gray-100 mb-6 flex items-center gap-2">
                Repositories
                <span className="bg-gray-800 text-gray-400 text-sm py-0.5 px-2.5 rounded-full font-medium">
                    {repos.length}
                </span>
            </h2>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[...Array(6)].map((_, i) => (
                        <LoadingSkeleton key={i} className="h-48 w-full rounded-xl" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {repos.map((repo) => (
                        <RepoCard
                            key={repo.id}
                            repo={repo}
                            owner={owner}
                            totalCommits={commitCounts?.get(repo.name)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
