import type { ContributorOverview } from "@github-sights/shared";
import clsx from "clsx";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";

interface ContributorLeaderboardProps {
    contributors: ContributorOverview[];
    loading?: boolean;
    owner: string;
    limit?: number;
}

const rankColors: Record<number, string> = {
    1: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    2: "text-gray-300 bg-gray-400/10 border-gray-400/20",
    3: "text-orange-400 bg-orange-500/10 border-orange-500/20"
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

export function ContributorLeaderboard({
    contributors,
    loading,
    owner,
    limit = 5
}: ContributorLeaderboardProps) {
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
                            <div className="w-7 h-7 rounded-full bg-gray-800 animate-pulse" />
                            <div className="w-8 h-8 rounded-full bg-gray-800 animate-pulse" />
                            <div className="flex-1 space-y-1.5">
                                <div className="h-4 w-24 bg-gray-800 rounded animate-pulse" />
                                <div className="h-2.5 w-full bg-gray-800 rounded animate-pulse" />
                            </div>
                            <div className="h-4 w-16 bg-gray-800 rounded animate-pulse" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const sorted = [...contributors]
        .sort((a, b) => b.totalCommits - a.totalCommits)
        .slice(0, limit);

    const topCommits = sorted[0]?.totalCommits || 1;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="bg-gray-900 rounded-xl border border-gray-800 p-6"
        >
            <div className="flex items-center gap-2 mb-5">
                <Trophy className="w-5 h-5 text-yellow-400" />
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                    Top Contributors
                </h3>
            </div>

            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="space-y-1"
            >
                {sorted.map((contributor, i) => {
                    const rank = i + 1;
                    const pct = (contributor.totalCommits / topCommits) * 100;

                    return (
                        <motion.div key={contributor.login} variants={rowVariants}>
                            <Link
                                to={`/${owner}/contributors/${contributor.login}`}
                                className="flex items-center gap-3 py-3 sm:py-2.5 px-2 -mx-2 rounded-lg hover:bg-gray-800/50 transition-colors duration-150 group"
                            >
                                {/* Rank badge */}
                                <div
                                    className={clsx(
                                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border shrink-0",
                                        rankColors[rank] ||
                                            "text-gray-500 bg-gray-800/50 border-gray-700"
                                    )}
                                >
                                    {rank}
                                </div>

                                {/* Avatar */}
                                <img
                                    src={contributor.avatar_url}
                                    alt={contributor.login}
                                    className="w-8 h-8 rounded-full ring-2 ring-gray-800 shrink-0"
                                    loading="lazy"
                                />

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors truncate">
                                            {contributor.login}
                                        </span>
                                        <span className="text-xs text-gray-400 font-mono shrink-0 ml-2">
                                            {contributor.totalCommits.toLocaleString()} commits
                                        </span>
                                    </div>

                                    {/* Progress bar */}
                                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden flex">
                                        <motion.div
                                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                                            initial={{ width: 0 }}
                                            animate={{
                                                width: `${pct}%`,
                                                backgroundSize: `${100 / (pct / 100)}% 100%`
                                            }}
                                            transition={{
                                                duration: 0.8,
                                                ease: "easeOut",
                                                delay: 0.2 + i * 0.05
                                            }}
                                        />
                                    </div>
                                </div>
                            </Link>
                        </motion.div>
                    );
                })}

                {sorted.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">
                        No contributor data available
                    </p>
                )}
            </motion.div>
        </motion.div>
    );
}
