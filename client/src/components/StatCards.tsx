import React from "react";
import { useNavigate } from "react-router-dom";
import { OverviewStats } from "../types";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { Activity, Box, Code, Flame, GitCommit, GitPullRequest, Users } from "lucide-react";

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
}

function formatLoc(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

export function StatCards({ stats, loading }: StatCardsProps) {
    const navigate = useNavigate();

    if (loading || !stats) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                    <LoadingSkeleton key={i} variant="card" className="h-32" />
                ))}
            </div>
        );
    }

    const totalLoc = (stats.totalAdditions ?? 0) + (stats.totalDeletions ?? 0);

    const cards: StatCardDef[] = [
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
            subtext: `${stats.openPRs} open · ${stats.mergedPRs} merged`,
            icon: GitPullRequest,
            color: "text-purple-400",
            bg: "bg-purple-500/10"
        },
        {
            label: "Active Contributors",
            value: stats.uniqueContributors.toLocaleString(),
            subtext: "Across all repos",
            icon: Users,
            color: "text-orange-400",
            bg: "bg-orange-500/10",
            href: "/contributors"
        },
        {
            label: "Lines Changed",
            value: formatLoc(totalLoc),
            subtext: `+${formatLoc(stats.totalAdditions ?? 0)} / -${formatLoc(stats.totalDeletions ?? 0)}`,
            icon: Code,
            color: "text-cyan-400",
            bg: "bg-cyan-500/10"
        },
        {
            label: "Longest Streak",
            value: `${stats.longestStreak} days`,
            subtext: `Current: ${stats.currentStreak} days`,
            icon: Flame,
            color: "text-red-400",
            bg: "bg-red-500/10"
        },
        {
            label: "Total Repos",
            value: stats.totalRepos,
            subtext: "Tracking activity",
            icon: Box,
            color: "text-gray-400",
            bg: "bg-gray-800"
        },
        {
            label: "Most Active Repo",
            value: stats.mostActiveRepo?.name || "N/A",
            subtext: `${stats.mostActiveRepo?.commits || 0} commits`,
            icon: Activity,
            color: "text-emerald-400",
            bg: "bg-emerald-500/10"
        }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {cards.map((card, i) => (
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
            ))}
        </div>
    );
}
