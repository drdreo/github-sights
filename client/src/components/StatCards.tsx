import React from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { formatLoc } from "../lib/format";
import { OverviewStats } from "../types";
import { LoadingSkeleton } from "./LoadingSkeleton";
import {
    Activity,
    Box,
    Code,
    Flame,
    GitCommit,
    GitPullRequest,
    Timer,
    Users
} from "lucide-react";
import type { OwnerWorkflowStats } from "../types";

interface StatCardDef {
    label: string;
    value: string | number;
    subtext: string;
    icon: React.ElementType;
    color: string;
    bg: string;
    href?: string;
}

interface StatCardsProps {
    stats?: OverviewStats;
    loading?: boolean;
    owner: string;
    dateRangeLabel?: string;
    syncSince?: string;
    workflowStats?: OwnerWorkflowStats;
}

export function StatCards({ stats, loading, owner, dateRangeLabel, syncSince, workflowStats }: StatCardsProps) {
    const navigate = useNavigate();

    if (loading || !stats) {
        return (
            <div className="space-y-8">
                <div>
                    <div className="h-5 w-40 bg-gray-800 rounded mb-4" />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[...Array(3)].map((_, i) => (
                            <LoadingSkeleton key={i} variant="card" className="h-32" />
                        ))}
                    </div>
                </div>
                <div>
                    <div className="h-5 w-40 bg-gray-800 rounded mb-4" />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[...Array(4)].map((_, i) => (
                            <LoadingSkeleton key={i} variant="card" className="h-32" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const totalLoc = (stats.totalAdditions ?? 0) + (stats.totalDeletions ?? 0);

    const activityCards: StatCardDef[] = [
        {
            label: "Total Commits",
            value: stats.totalCommits.toLocaleString(),
            subtext: `~${stats.avgCommitsPerDay} per day`,
            icon: GitCommit,
            color: "text-blue-400",
            bg: "bg-blue-500/10"
        },
        {
            label: "Pull Requests",
            value: stats.totalPRs.toLocaleString(),
            subtext: `${stats.openPRs} opened · ${stats.mergedPRs} merged`,
            icon: GitPullRequest,
            color: "text-purple-400",
            bg: "bg-purple-500/10"
        },
        {
            label: "Lines Changed",
            value: formatLoc(totalLoc),
            subtext: `+${formatLoc(stats.totalAdditions ?? 0)} / -${formatLoc(stats.totalDeletions ?? 0)}`,
            icon: Code,
            color: "text-cyan-400",
            bg: "bg-cyan-500/10"
        },
        ...(workflowStats && workflowStats.totalRuns > 0
            ? [
                  {
                      label: "CI Minutes",
                      value: workflowStats.totalMinutes.toLocaleString(),
                      subtext: `${workflowStats.totalRuns} runs · ${workflowStats.successRate}% success`,
                      icon: Timer,
                      color: "text-green-400",
                      bg: "bg-green-500/10"
                  } as StatCardDef
              ]
            : [])
    ];

    const overviewCards: StatCardDef[] = [
        {
            label: "Total Repos",
            value: stats.totalRepos,
            subtext: "Tracking activity",
            icon: Box,
            color: "text-gray-400",
            bg: "bg-gray-800",
            href: `/${owner}/repositories`
        },
        {
            label: "Active Contributors",
            value: stats.uniqueContributors.toLocaleString(),
            subtext: "Across all repos",
            icon: Users,
            color: "text-orange-400",
            bg: "bg-orange-500/10",
            href: `/${owner}/contributors`
        },
        {
            label: "Most Active Repo",
            value: stats.mostActiveRepo?.name || "N/A",
            subtext: `${stats.mostActiveRepo?.commits || 0} commits`,
            icon: Activity,
            color: "text-emerald-400",
            bg: "bg-emerald-500/10",
            href: stats.mostActiveRepo?.name
                ? `/${owner}/repo/${stats.mostActiveRepo.name}`
                : undefined
        },
        {
            label: "Longest Streak",
            value: `${stats.longestStreak} days`,
            subtext: `Current: ${stats.currentStreak} days`,
            icon: Flame,
            color: "text-red-400",
            bg: "bg-red-500/10"
        }
    ];

    const renderCard = (card: StatCardDef, i: number) => (
        <div
            key={i}
            onClick={card.href ? () => navigate(card.href!) : undefined}
            className={`bg-gray-900 rounded-xl border border-gray-800 p-6 flex items-start justify-between transition-all hover:shadow-lg hover:shadow-black/20 group ${card.href ? "cursor-pointer hover:border-blue-500/30" : ""}`}
        >
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-400 mb-1">{card.label}</p>
                <h3 className="text-2xl font-bold text-gray-100 tracking-tight group-hover:text-blue-400 transition-colors">
                    {card.value}
                </h3>
                {card.subtext && (
                    <p className="text-xs text-gray-500 mt-2 font-medium">{card.subtext}</p>
                )}
            </div>
            <div className={`p-3 rounded-lg shrink-0 ml-3 ${card.bg} ${card.color}`}>
                <card.icon className="w-6 h-6" />
            </div>
        </div>
    );

    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
                    Activity{dateRangeLabel ? ` · ${dateRangeLabel}` : ""}
                </h3>
                <div className={`grid grid-cols-1 gap-6 ${activityCards.length > 3 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"}`}>
                    {activityCards.map(renderCard)}
                </div>
            </div>
            <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
                    Overview
                    {syncSince ? ` · Since ${format(new Date(syncSince), "MMM d, yyyy")}` : ""}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {overviewCards.map(renderCard)}
                </div>
            </div>
        </div>
    );
}
