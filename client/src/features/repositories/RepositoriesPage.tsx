import { ArrowLeft, Search } from "lucide-react";
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FetchedAtBadge } from "../../shared/components/FetchedAtBadge";
import { SyncBanner } from "../../shared/components/SyncBanner";
import { useOwner } from "../../shared/hooks/useOwner";
import { RepoGrid } from "./components/RepoGrid";

import { useCommitTimelines, useRepos, useRepoSnapshots } from "./hooks";

export default function RepositoriesPage() {
    const owner = useOwner();
    const [search, setSearch] = useState("");

    const { data: reposResponse, isLoading: reposLoading } = useRepos(owner);
    const repos = reposResponse?.data;
    const fetchedAt = reposResponse?.fetchedAt;
    const { data: timelines } = useCommitTimelines(owner);
    const { data: snapshots } = useRepoSnapshots(owner);

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

    const filteredRepos = useMemo(() => {
        if (!search.trim()) return sortedRepos;
        const q = search.toLowerCase();
        return sortedRepos.filter(
            (r) =>
                r.name.toLowerCase().includes(q) ||
                r.description?.toLowerCase().includes(q) ||
                r.language?.toLowerCase().includes(q)
        );
    }, [sortedRepos, search]);

    const commitCounts = useMemo(() => {
        if (!timelines) return new Map<string, number>();
        return new Map(timelines.map((t) => [t.repo.name, t.totalCommits]));
    }, [timelines]);

    const snapshotStats = useMemo(() => {
        if (!snapshots) return new Map();
        return new Map(
            snapshots.map((s) => [
                s.name,
                {
                    totalPRs: s.totalPRs,
                    openPRs: s.openPRs,
                    mergedPRs: s.mergedPRs,
                    totalAdditions: s.totalAdditions,
                    totalDeletions: s.totalDeletions,
                    ciSuccessRate: s.ciSuccessRate,
                    ciAvgDurationSeconds: s.ciAvgDurationSeconds,
                    lastCiConclusion: s.lastCiConclusion
                }
            ])
        );
    }, [snapshots]);

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

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-100 tracking-tight flex items-center gap-2">
                            {owner}
                            <span className="text-gray-500 font-normal text-xl">
                                / Repositories
                            </span>
                            {fetchedAt && <FetchedAtBadge fetchedAt={fetchedAt} />}
                        </h1>
                        <SyncBanner owner={owner} />
                    </div>
                    <div className="relative w-full md:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search repositories..."
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder:text-gray-500 focus:bg-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all duration-200"
                        />
                    </div>
                </div>

                <RepoGrid
                    repos={filteredRepos}
                    owner={owner}
                    loading={reposLoading}
                    commitCounts={commitCounts}
                    snapshotStats={snapshotStats}
                    totalCount={sortedRepos.length}
                />
            </div>
        </div>
    );
}
