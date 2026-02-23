import React from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, AlertCircle } from "lucide-react";

import {
    useRepo,
    useCommits,
    usePulls,
    useRepoContributorStats,
    useConfig
} from "../hooks/useGitHub";
import { RepoDetailSkeleton } from "../components/RepoDetailSkeleton";
import { RepoHeader } from "../components/RepoHeader";
import { RepoTabs } from "../components/RepoTabs";

export default function RepoDetailPage() {
    const { owner: paramOwner, repo: paramRepo } = useParams<{ owner: string; repo: string }>();
    const { data: config } = useConfig();

    const owner = paramOwner || config?.owner || "";
    const repoName = paramRepo || "";

    const { data: repository, isLoading: repoLoading } = useRepo(owner, repoName);
    const { data: commits, isLoading: commitsLoading } = useCommits(owner, repoName);
    const { data: pulls, isLoading: pullsLoading } = usePulls(owner, repoName);
    const { data: contributors, isLoading: contribLoading } = useRepoContributorStats(
        owner,
        repoName
    );

    if (repoLoading) {
        return <RepoDetailSkeleton />;
    }

    if (!repository) {
        return (
            <div className="p-8 flex flex-col items-center justify-center h-screen text-center">
                <AlertCircle className="w-16 h-16 text-gray-600 mb-4" />
                <h1 className="text-2xl font-bold text-gray-100">Repository not found</h1>
                <Link to="/" className="mt-4 text-blue-600 hover:underline">
                    Return to Dashboard
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 p-8">
            <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-100 transition-colors font-medium group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Back to Dashboard
                </Link>

                <RepoHeader repository={repository} />

                <RepoTabs
                    commits={commits}
                    commitsLoading={commitsLoading}
                    pulls={pulls}
                    pullsLoading={pullsLoading}
                    contributors={contributors}
                    contribLoading={contribLoading}
                />
            </div>
        </div>
    );
}
