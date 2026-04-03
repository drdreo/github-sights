import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import { format, subDays } from "date-fns";
import type { RepoCommitTimeline } from "../../../shared/types";

interface RepoRankingProps {
    timelines: RepoCommitTimeline[];
    loading?: boolean;
    owner: string;
    limit?: number;
}

const LANGUAGE_COLORS: Record<string, string> = {
    TypeScript: "#3178c6",
    JavaScript: "#f1e05a",
    Python: "#3572A5",
    Go: "#00ADD8",
    Rust: "#dea584",
    Java: "#b07219",
    "C#": "#178600",
    "C++": "#f34b7d",
    Ruby: "#701516",
    PHP: "#4F5D95",
    Swift: "#F05138",
    Kotlin: "#A97BFF",
    Dart: "#00B4AB",
    Shell: "#89e051",
    HTML: "#e34c26",
    CSS: "#563d7c"
};

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.06 }
    }
};

const rowVariants = {
    hidden: { opacity: 0, x: -16 },
    visible: { opacity: 1, x: 0 }
};

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
    const chartData = data.map((v, i) => ({ i, v }));
    return (
        <div className="w-[60px] h-[24px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 1, right: 0, left: 0, bottom: 1 }}>
                    <defs>
                        <linearGradient id={`mini-${color}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area
                        type="monotone"
                        dataKey="v"
                        stroke={color}
                        strokeWidth={1.2}
                        fill={`url(#mini-${color})`}
                        dot={false}
                        animationDuration={800}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

export function RepoRanking({ timelines, loading, owner, limit = 5 }: RepoRankingProps) {
    const rankedRepos = useMemo(() => {
        const now = new Date();

        return [...timelines]
            .sort((a, b) => b.totalCommits - a.totalCommits)
            .slice(0, limit)
            .map((timeline) => {
                const sparkline: number[] = [];
                for (let d = 0; d < 14; d++) {
                    const dateStr = format(subDays(now, 13 - d), "yyyy-MM-dd");
                    const dayData = timeline.daily.find((dd) => dd.date === dateStr);
                    sparkline.push(dayData?.count || 0);
                }

                return {
                    name: timeline.repo.name,
                    language: timeline.repo.language,
                    totalCommits: timeline.totalCommits,
                    sparkline
                };
            });
    }, [timelines, limit]);

    if (loading) {
        return (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                <div className="flex items-center gap-2 mb-5">
                    <div className="w-5 h-5 bg-gray-800 rounded animate-pulse" />
                    <div className="h-5 w-36 bg-gray-800 rounded animate-pulse" />
                </div>
                <div className="space-y-3">
                    {Array.from({ length: limit }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 py-2">
                            <div className="h-4 w-32 bg-gray-800 rounded animate-pulse" />
                            <div className="flex-1" />
                            <div className="h-4 w-16 bg-gray-800 rounded animate-pulse" />
                            <div className="w-[60px] h-[24px] bg-gray-800 rounded animate-pulse" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="bg-gray-900 rounded-xl border border-gray-800 p-6"
        >
            <div className="flex items-center gap-2 mb-5">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                    Most Active Repos
                </h3>
            </div>

            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="space-y-1"
            >
                {rankedRepos.map((repo, i) => {
                    const langColor = repo.language
                        ? LANGUAGE_COLORS[repo.language] || "#6b7280"
                        : "#6b7280";

                    return (
                        <motion.div key={repo.name} variants={rowVariants}>
                            <Link
                                to={`/${owner}/repo/${repo.name}`}
                                className="flex items-center gap-3 py-3 sm:py-2.5 px-2 -mx-2 rounded-lg hover:bg-gray-800/50 transition-colors duration-150 group"
                            >
                                {/* Rank number */}
                                <span className="text-xs font-bold text-gray-600 w-4 text-right shrink-0">
                                    {i + 1}
                                </span>

                                {/* Language dot */}
                                <div
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: langColor }}
                                    title={repo.language || "Unknown"}
                                />

                                {/* Repo name */}
                                <span className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors truncate flex-1 min-w-0">
                                    {repo.name}
                                </span>

                                {/* Commit count */}
                                <span className="text-xs text-gray-400 font-mono shrink-0">
                                    {repo.totalCommits.toLocaleString()} commits
                                </span>

                                {/* Sparkline */}
                                <MiniSparkline data={repo.sparkline} color={langColor} />
                            </Link>
                        </motion.div>
                    );
                })}

                {rankedRepos.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">
                        No repository data available
                    </p>
                )}
            </motion.div>
        </motion.div>
    );
}
