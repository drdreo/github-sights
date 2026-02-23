import React from "react";
import { OverviewStats } from "../types";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { Activity, Box, Flame, GitCommit, GitPullRequest, Users } from "lucide-react";

interface StatCardsProps {
    stats?: OverviewStats;
    loading?: boolean;
}

export function StatCards({ stats, loading }: StatCardsProps) {
    if (loading || !stats) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                    <LoadingSkeleton key={i} variant="card" className="h-32" />
                ))}
            </div>
        );
    }

    const cards = [
        {
            label: "Total Commits",
            value: stats.totalCommits.toLocaleString(),
            subtext: `~${stats.avgCommitsPerDay} per day`,
            icon: GitCommit,
            color: "text-blue-400",
            bg: "bg-blue-500/10",
        },
        {
            label: "Pull Requests",
            value: stats.totalPRs.toLocaleString(),
            subtext: `${stats.mergedPRs} merged (${stats.totalPRs > 0 ? Math.round((stats.mergedPRs / stats.totalPRs) * 100) : 0}%)`,
            icon: GitPullRequest,
            color: "text-purple-400",
            bg: "bg-purple-500/10",
        },
        {
            label: "Active Contributors",
            value: stats.uniqueContributors.toLocaleString(),
            subtext: "Across all repos",
            icon: Users,
            color: "text-orange-400",
            bg: "bg-orange-500/10",
        },
        {
            label: "Longest Streak",
            value: `${stats.longestStreak} days`,
            subtext: `Current: ${stats.currentStreak} days`,
            icon: Flame,
            color: "text-red-400",
            bg: "bg-red-500/10",
        },
        {
            label: "Total Repos",
            value: stats.totalRepos,
            subtext: "Tracking activity",
            icon: Box,
            color: "text-gray-400",
            bg: "bg-gray-800",
        },
        {
            label: "Most Active Repo",
            value: stats.mostActiveRepo?.name || "N/A",
            subtext: `${stats.mostActiveRepo?.commits || 0} commits`,
            icon: Activity,
            color: "text-emerald-400",
            bg: "bg-emerald-500/10",
        },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {cards.map((card, i) => (
                <div
                    key={i}
                    className="bg-gray-900 rounded-xl border border-gray-800 p-6 flex items-start justify-between transition-all hover:shadow-lg hover:shadow-black/20 group"
                >
                    <div>
                        <p className="text-sm font-medium text-gray-400 mb-1">{card.label}</p>
                        <h3 className="text-2xl font-bold text-gray-100 tracking-tight group-hover:text-blue-400 transition-colors">
                            {card.value}
                        </h3>
                        {card.subtext && (
                            <p className="text-xs text-gray-500 mt-2 font-medium">{card.subtext}</p>
                        )}
                    </div>
                    <div className={`p-3 rounded-lg ${card.bg} ${card.color}`}>
                        <card.icon className="w-6 h-6" />
                    </div>
                </div>
            ))}
        </div>
    );
}
