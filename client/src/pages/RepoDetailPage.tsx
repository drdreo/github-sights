import React from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, AlertCircle } from "lucide-react";

import {
    useRepo,
    useCommits,
    usePulls,
    useRepoContributorStats,
    useWorkflows,
    useWorkflowStats
} from "../hooks/useGitHub";
import { useOwner } from "../hooks/useOwner";
import { RepoDetailSkeleton } from "../components/RepoDetailSkeleton";
import { RepoHeader } from "../components/RepoHeader";
import { RepoTabs } from "../components/RepoTabs";

export default function RepoDetailPage() {
    const owner = useOwner();
    const { repo: paramRepo } = useParams<{ repo: string }>();
    const repoName = paramRepo || "";

    const { data: repository, isLoading: repoLoading } = useRepo(owner, repoName);
    const { data: commits, isLoading: commitsLoading } = useCommits(owner, repoName);
    const { data: pulls, isLoading: pullsLoading } = usePulls(owner, repoName);
    const { data: contributors, isLoading: contribLoading } = useRepoContributorStats(
        owner,
        repoName
    );
    const { data: workflows, isLoading: workflowsLoading } = useWorkflows(owner, repoName);
    const { data: workflowStats, isLoading: workflowStatsLoading } = useWorkflowStats(
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
                <Link to={`/${owner}/repositories`} className="mt-4 text-blue-600 hover:underline">
                    Return to Repositories
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 p-8">
            <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
                <Link
                    to={`/${owner}/repositories`}
                    className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-100 transition-colors font-medium group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Back to Repositories
                </Link>

                <RepoHeader
                    repository={repository}
                    commits={commits}
                    pulls={pulls}
                    contributors={contributors}
                />

                <RepoTabs
                    commits={commits}
                    commitsLoading={commitsLoading}
                    pulls={pulls}
                    pullsLoading={pullsLoading}
                    contributors={contributors}
                    contribLoading={contribLoading}
                    workflows={workflows}
                    workflowsLoading={workflowsLoading}
                    workflowStats={workflowStats}
                    workflowStatsLoading={workflowStatsLoading}
                />
            </div>
        </div>
    );
}
