import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { useRepos, useCommitTimelines } from "../hooks/useGitHub";
import { useOwner } from "../hooks/useOwner";
import { RepoGrid } from "../components/RepoGrid";

export default function RepositoriesPage() {
    const owner = useOwner();

    const { data: repos, isLoading: reposLoading } = useRepos(owner);
    const { data: timelines } = useCommitTimelines(owner);

    const sortedRepos = useMemo(() => {
        if (!repos) return [];
        return [...repos].sort((a, b) => {
            const aDate = a.updated_at;
            const bDate = b.updated_at;
            const dateCompare = bDate.localeCompare(aDate);
            if (dateCompare !== 0) return dateCompare;
            return b.stargazers_count - a.stargazers_count;
        });
    }, [repos]);

    const commitCounts = useMemo(() => {
        if (!timelines) return new Map<string, number>();
        return new Map(timelines.map((t) => [t.repo.name, t.totalCommits]));
    }, [timelines]);

    return (
        <div className="min-h-screen bg-gray-950 p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                <Link
                    to={`/${owner}/dashboard`}
                    className="inline-flex items-center text-gray-400 hover:text-gray-100 transition-colors gap-2 group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Back to Dashboard
                </Link>

                <div>
                    <h1 className="text-3xl font-bold text-gray-100 tracking-tight flex items-center gap-2">
                        {owner}
                        <span className="text-gray-500 font-normal text-xl">/ Repositories</span>
                    </h1>
                </div>

                <RepoGrid
                    repos={sortedRepos}
                    owner={owner}
                    loading={reposLoading}
                    commitCounts={commitCounts}
                />
            </div>
        </div>
    );
}
