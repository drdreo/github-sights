import React, { useState } from "react";
import { GitCommit, GitPullRequest, Users } from "lucide-react";
import { CommitList } from "./CommitList";
import { PullRequestList } from "./PullRequestList";
import { ContributorGrid } from "./ContributorGrid";
import type { Commit, PullRequest, RepoContributorStat } from "../types";

type TabId = "commits" | "pulls" | "contributors";

interface TabButtonProps {
    id: TabId;
    label: string;
    icon: React.ElementType;
    count?: number;
    activeTab: TabId;
    onClick: (id: TabId) => void;
}

function TabButton({ id, label, icon: Icon, count, activeTab, onClick }: TabButtonProps) {
    const isActive = activeTab === id;
    return (
        <button
            onClick={() => onClick(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium border-b-2 transition-all ${
                isActive
                    ? "border-blue-400 text-blue-400 bg-blue-500/10"
                    : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            }`}
        >
            <Icon className="w-4 h-4" />
            {label}
            {count !== undefined && (
                <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                        isActive ? "bg-blue-500/20 text-blue-300" : "bg-gray-800 text-gray-400"
                    }`}
                >
                    {count}
                </span>
            )}
        </button>
    );
}

interface RepoTabsProps {
    commits: Commit[] | undefined;
    commitsLoading: boolean;
    pulls: PullRequest[] | undefined;
    pullsLoading: boolean;
    contributors: RepoContributorStat[] | undefined;
    contribLoading: boolean;
}

export function RepoTabs({
    commits,
    commitsLoading,
    pulls,
    pullsLoading,
    contributors,
    contribLoading
}: RepoTabsProps) {
    const [activeTab, setActiveTab] = useState<TabId>("commits");

    return (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden min-h-[500px]">
            <div className="flex border-b border-gray-800">
                <TabButton
                    id="commits"
                    label="Commits"
                    icon={GitCommit}
                    count={commits?.length}
                    activeTab={activeTab}
                    onClick={setActiveTab}
                />
                <TabButton
                    id="pulls"
                    label="Pull Requests"
                    icon={GitPullRequest}
                    count={pulls?.length}
                    activeTab={activeTab}
                    onClick={setActiveTab}
                />
                <TabButton
                    id="contributors"
                    label="Contributors"
                    icon={Users}
                    count={contributors?.length}
                    activeTab={activeTab}
                    onClick={setActiveTab}
                />
            </div>

            <div>
                {activeTab === "commits" && (
                    <CommitList commits={commits} loading={commitsLoading} />
                )}
                {activeTab === "pulls" && <PullRequestList pulls={pulls} loading={pullsLoading} />}
                {activeTab === "contributors" && (
                    <ContributorGrid contributors={contributors} loading={contribLoading} />
                )}
            </div>
        </div>
    );
}
