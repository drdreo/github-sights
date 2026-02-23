import React, { useEffect, useMemo, useRef } from "react";
import { format, differenceInDays, addDays, isSameDay } from "date-fns";
import { GitCommit, ExternalLink } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { RepoCommitTimeline, Commit } from "../types";

interface CommitTimelineProps {
    timelines: RepoCommitTimeline[];
    startDate: Date;
    endDate: Date;
    loading?: boolean;
}

// Constants for layout
const DAY_WIDTH = 140; // Wider for text bubbles
const PILL_HEIGHT = 28; // Rectangular pill height
const PILL_GAP = 6; // Vertical gap between stacked commits
const LABEL_WIDTH = 220; // Sticky repo label width
const ROW_PADDING = 16; // Vertical padding per row
const HEADER_HEIGHT = 48; // Height of date header row

// Vibrant palette for repos
const REPO_COLORS = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-violet-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-cyan-500",
    "bg-fuchsia-500",
    "bg-lime-500",
    "bg-indigo-500"
];

const getRepoColor = (repoName: string) => {
    let hash = 0;
    for (let i = 0; i < repoName.length; i++) {
        hash = repoName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % REPO_COLORS.length;
    return REPO_COLORS[index];
};

export function CommitTimeline({ timelines, startDate, endDate, loading }: CommitTimelineProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    // Calculate total days to determine width
    const totalDays = useMemo(() => {
        const days = differenceInDays(endDate, startDate) + 1;
        return Math.max(days, 7); // Minimum 7 days width
    }, [startDate, endDate]);

    const totalWidth = totalDays * DAY_WIDTH;

    // Generate all days for the header
    const allDays = useMemo(() => {
        return Array.from({ length: totalDays }).map((_, i) => addDays(startDate, i));
    }, [startDate, totalDays]);

    // Auto-scroll to the far right (today) when data loads
    useEffect(() => {
        const el = containerRef.current;
        if (el && !loading && timelines.length > 0) {
            el.scrollLeft = el.scrollWidth - el.clientWidth;
        }
    }, [loading, timelines.length, totalDays]);

    if (loading) {
        return <TimelineSkeleton />;
    }

    return (
        <div
            ref={containerRef}
            className="w-full min-h-[400px] max-h-[80vh] bg-gray-900 rounded-xl border border-gray-800 overflow-auto select-none custom-scrollbar"
        >
            <div
                className="inline-block relative min-w-full"
                style={{ width: LABEL_WIDTH + totalWidth }}
            >
                {/* 1. Header Row (Dates) */}
                <div
                    className="sticky top-0 z-30 flex border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm"
                    style={{ height: HEADER_HEIGHT }}
                >
                    {/* Sticky Corner (Repo Label Header) */}
                    <div
                        className="sticky left-0 z-40 flex-shrink-0 bg-gray-900 border-r border-gray-800 px-4 flex items-center shadow-[4px_0_12px_-4px_rgba(0,0,0,0.3)]"
                        style={{ width: LABEL_WIDTH }}
                    >
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            Repositories
                        </span>
                    </div>

                    {/* Date Columns Header */}
                    <div className="flex relative">
                        {allDays.map((date, i) => (
                            <div
                                key={i}
                                className="flex items-center justify-center border-r border-gray-800/50 text-xs font-medium text-gray-400"
                                style={{ width: DAY_WIDTH }}
                            >
                                {format(date, "d.M.yyyy")}
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. Repo Rows */}
                <div className="flex flex-col">
                    {timelines.map((timeline) => (
                        <RepoRow
                            key={timeline.repo.id}
                            timeline={timeline}
                            startDate={startDate}
                            totalDays={totalDays}
                            allDays={allDays}
                        />
                    ))}

                    {timelines.length === 0 && (
                        <div className="p-12 text-center text-gray-500 text-sm italic sticky left-0 w-full">
                            No repositories selected or no commit data found for this period.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function RepoRow({
    timeline,
    startDate,
    totalDays,
    allDays
}: {
    timeline: RepoCommitTimeline;
    startDate: Date;
    totalDays: number;
    allDays: Date[];
}) {
    const repoColor = getRepoColor(timeline.repo.name);

    // Calculate max stack height for this row to determine row height
    const maxCommitsInDay = useMemo(() => {
        if (!timeline.daily.length) return 0;
        return Math.max(...timeline.daily.map((d) => d.count));
    }, [timeline.daily]);

    // Base height + space for stacked pills
    const contentHeight = Math.max(0, maxCommitsInDay * (PILL_HEIGHT + PILL_GAP));
    const rowHeight = Math.max(80, ROW_PADDING * 2 + contentHeight); // Minimum 80px row height

    return (
        <div
            className="flex border-b border-dashed border-gray-800 hover:bg-gray-800/30 transition-colors group relative"
            style={{ minHeight: rowHeight }}
        >
            {/* Sticky Repo Label */}
            <div
                className="sticky left-0 z-20 flex-shrink-0 bg-gray-900 group-hover:bg-gray-800/30 border-r border-gray-800 p-4 flex flex-col justify-center transition-colors shadow-[4px_0_12px_-4px_rgba(0,0,0,0.3)]"
                style={{ width: LABEL_WIDTH }}
            >
                <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2.5 h-2.5 rounded-md ${repoColor} shadow-sm`} />
                    <h3
                        className="text-sm font-semibold text-gray-200 truncate"
                        title={timeline.repo.full_name}
                    >
                        {timeline.repo.name}
                    </h3>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 pl-4.5">
                    <span className="flex items-center gap-1" title="Total commits in period">
                        <GitCommit className="w-3 h-3" />
                        {timeline.totalCommits}
                    </span>
                    {timeline.repo.language && (
                        <span className="truncate max-w-[100px] opacity-75 bg-gray-800 px-1.5 py-0.5 rounded text-[10px]">
                            {timeline.repo.language}
                        </span>
                    )}
                </div>
            </div>

            {/* Timeline Area */}
            <div className="relative flex">
                {/* Day Columns Background */}
                {allDays.map((day, i) => (
                    <div
                        key={`bg-${i}`}
                        className="border-r border-gray-800/50 h-full flex-shrink-0"
                        style={{ width: DAY_WIDTH }}
                    />
                ))}

                {/* Commits Overlay */}
                <div className="absolute inset-0 flex">
                    {allDays.map((day, i) => {
                        // Find commits for this day
                        const dayData = timeline.daily.find((d) =>
                            isSameDay(new Date(d.date), day)
                        );
                        const commits = dayData ? dayData.commits : [];

                        if (commits.length === 0) {
                            return <div key={`empty-${i}`} style={{ width: DAY_WIDTH }} />;
                        }

                        return (
                            <div
                                key={`col-${i}`}
                                className="flex flex-col gap-[6px] py-4 px-2 items-start justify-center h-full"
                                style={{ width: DAY_WIDTH }}
                            >
                                {commits.map((commit) => (
                                    <CommitBubble
                                        key={commit.sha}
                                        commit={commit}
                                        color={repoColor}
                                    />
                                ))}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function CommitBubble({ commit, color }: { commit: Commit; color: string }) {
    return (
        <Tooltip.Root>
            <Tooltip.Trigger asChild>
                <div
                    className={`
            ${color} 
            text-white text-[10px] font-medium
            rounded-md px-2 flex items-center
            cursor-pointer shadow-sm 
             hover:ring-2 hover:ring-offset-1 hover:ring-gray-600 hover:brightness-110 hover:z-50
            transition-all duration-200
            w-full truncate
          `}
                    style={{
                        height: PILL_HEIGHT
                    }}
                >
                    <span className="truncate w-full drop-shadow-sm opacity-95">
                        {commit.message}
                    </span>
                </div>
            </Tooltip.Trigger>
            <Tooltip.Portal>
                <Tooltip.Content
                    className="z-50 max-w-sm bg-gray-900/95 backdrop-blur text-white text-xs rounded-lg p-3 shadow-xl animate-in fade-in zoom-in-95 duration-200 border border-gray-800"
                    sideOffset={5}
                    side="top"
                >
                    <div className="flex flex-col gap-2">
                        <div className="font-semibold text-gray-100 leading-relaxed text-sm">
                            {commit.message}
                        </div>

                        <div className="w-full h-px bg-gray-800/50" />

                        <div className="flex items-center justify-between text-gray-400 gap-4">
                            <div className="flex items-center gap-2">
                                {commit.author.avatar_url ? (
                                    <img
                                        src={commit.author.avatar_url}
                                        alt=""
                                        className="w-6 h-6 rounded-full border border-gray-700"
                                    />
                                ) : (
                                    <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[9px] font-bold">
                                        {commit.author.name.charAt(0)}
                                    </div>
                                )}
                                <div className="flex flex-col leading-none gap-0.5">
                                    <span className="text-gray-300 font-medium">
                                        {commit.author.name}
                                    </span>
                                    <span className="text-[10px] text-gray-500">
                                        {format(new Date(commit.author.date), "MMM d, yyyy HH:mm")}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="text-gray-500 text-[10px] font-mono mt-1 flex justify-between items-center bg-gray-950/50 rounded px-2 py-1.5 border border-gray-800">
                            <span className="select-all">{commit.sha.substring(0, 7)}</span>
                            <a
                                href={commit.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-blue-400 flex items-center gap-1 transition-colors text-blue-500/80"
                            >
                                View on GitHub <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    </div>
                    <Tooltip.Arrow className="fill-gray-900/95" />
                </Tooltip.Content>
            </Tooltip.Portal>
        </Tooltip.Root>
    );
}

function TimelineSkeleton() {
    return (
        <div className="w-full h-[500px] flex flex-col bg-gray-900 rounded-xl border border-gray-800 overflow-hidden animate-pulse">
            {/* Header Skeleton */}
            <div className="h-[48px] border-b border-gray-800 flex">
                <div className="w-[220px] border-r border-gray-800 bg-gray-800" />
                <div className="flex-1 bg-gray-800/30 flex">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="flex-1 border-r border-gray-800" />
                    ))}
                </div>
            </div>

            {/* Row Skeletons */}
            {[1, 2, 3].map((i) => (
                <div key={i} className="h-[120px] border-b border-dashed border-gray-800 flex">
                    <div className="w-[220px] border-r border-gray-800 p-4 flex flex-col justify-center gap-3">
                        <div className="flex gap-2 items-center">
                            <div className="w-3 h-3 rounded bg-gray-700" />
                            <div className="h-4 w-24 bg-gray-700 rounded" />
                        </div>
                        <div className="h-3 w-16 bg-gray-800 rounded ml-5" />
                    </div>
                    <div className="flex-1 relative flex">
                        {[1, 2, 3, 4, 5, 6].map((col) => (
                            <div
                                key={col}
                                className="flex-1 border-r border-gray-800 p-2 flex flex-col gap-2 justify-center"
                            >
                                {Math.random() > 0.6 && (
                                    <div className="h-7 w-full bg-gray-800 rounded-md" />
                                )}
                                {Math.random() > 0.8 && (
                                    <div className="h-7 w-full bg-gray-800 rounded-md" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
