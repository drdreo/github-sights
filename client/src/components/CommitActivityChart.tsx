import React, { useMemo, useState, useCallback } from "react";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    CartesianGrid
} from "recharts";
import type { Payload } from "recharts/types/component/DefaultLegendContent";
import { format, eachDayOfInterval, differenceInDays } from "date-fns";
import { RepoCommitTimeline } from "../types";

interface CommitActivityChartProps {
    timelines: RepoCommitTimeline[];
    startDate: Date;
    endDate: Date;
    loading?: boolean;
}

// Vibrant palette matching existing pills
const LINE_COLORS = [
    "#3b82f6",
    "#10b981",
    "#8b5cf6",
    "#f59e0b",
    "#f43f5e",
    "#06b6d4",
    "#d946ef",
    "#84cc16",
    "#6366f1",
    "#ec4899"
];

const getRepoColor = (repoName: string): string => {
    let hash = 0;
    for (let i = 0; i < repoName.length; i++) {
        hash = repoName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % LINE_COLORS.length;
    return LINE_COLORS[index];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    return (
        <div
            style={{
                backgroundColor: "rgba(17, 24, 39, 0.95)",
                border: "1px solid #1f2937",
                borderRadius: "0.5rem",
                padding: "0.5rem 0.75rem",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                color: "#f3f4f6",
                fontSize: "0.8rem"
            }}
        >
            <p style={{ color: "#e5e7eb", marginBottom: "0.25rem" }}>
                {format(new Date(label), "MMM d, yyyy - EEEE")}
            </p>
            {payload.map((entry: any) => (
                <p key={entry.dataKey} style={{ color: entry.color, padding: 0, margin: 0 }}>
                    {entry.name}: {entry.value}
                </p>
            ))}
            {(data?.additions > 0 || data?.deletions > 0) && (
                <p style={{ marginTop: "0.25rem", fontFamily: "monospace", fontSize: "0.75rem" }}>
                    <span style={{ color: "#4ade80" }}>+{data.additions}</span>{" "}
                    <span style={{ color: "#f87171" }}>-{data.deletions}</span>
                </p>
            )}
        </div>
    );
};

export const CommitActivityChart: React.FC<CommitActivityChartProps> = ({
    timelines,
    startDate,
    endDate,
    loading
}) => {
    const { chartData, topRepoNames } = useMemo(() => {
        if (!timelines.length) return { chartData: [], topRepoNames: [] };

        // 1. Identify top 10 repos by total commits
        const topReposList = [...timelines]
            .sort((a, b) => b.totalCommits - a.totalCommits)
            .slice(0, 10);

        const topRepoNamesSet = new Set(topReposList.map((t) => t.repo.name));

        // 2. Generate all dates in range
        const days = eachDayOfInterval({ start: startDate, end: endDate });

        // 3. Build data points
        const data = days.map((day) => {
            const dayStr = format(day, "yyyy-MM-dd");
            const point: Record<string, string | number> = {
                date: dayStr,
                total: 0
            };

            let total = 0;
            let additions = 0;
            let deletions = 0;
            timelines.forEach((timeline) => {
                // Find activity for this specific day
                const dayActivity = timeline.daily.find((d) => d.date === dayStr);
                const count = dayActivity ? dayActivity.count : 0;

                // Add to total
                total += count;

                // Sum LoC from individual commits
                if (dayActivity) {
                    for (const commit of dayActivity.commits) {
                        if (commit.stats) {
                            additions += commit.stats.additions;
                            deletions += commit.stats.deletions;
                        }
                    }
                }

                // If it's a top repo, add individual property
                if (topRepoNamesSet.has(timeline.repo.name)) {
                    point[timeline.repo.name] = count;
                }
            });

            point.total = total;
            point.additions = additions;
            point.deletions = deletions;
            return point;
        });

        return {
            chartData: data,
            topRepoNames: topReposList.map((t) => t.repo.name)
        };
    }, [timelines, startDate, endDate]);

    const totalDays = differenceInDays(endDate, startDate);

    const formatTick = useCallback(
        (dateStr: string) => {
            const d = new Date(dateStr);
            if (totalDays <= 14) return format(d, "MMM d - E"); // "Mar 5 - Wed"
            if (totalDays <= 90) return format(d, "MMM d"); // "Mar 5"
            return format(d, "MMM yyyy"); // "Mar 2026"
        },
        [totalDays]
    );

    const [opacity, setOpacity] = useState<Record<string, number>>({});

    const handleMouseEnter = useCallback(
        (data: Payload) => {
            const dataKey = data.dataKey != null ? String(data.dataKey) : undefined;
            if (!dataKey) return;
            const allKeys = [...topRepoNames, "total"];
            const next: Record<string, number> = {};
            for (const key of allKeys) {
                next[key] = key === dataKey ? 1 : 0.15;
            }
            setOpacity(next);
        },
        [topRepoNames]
    );

    const handleMouseLeave = useCallback(() => {
        setOpacity({});
    }, []);

    if (loading) {
        return (
            <div className="w-full h-full bg-gray-900 rounded-xl overflow-hidden relative flex items-center justify-center">
                <div className="w-full h-full bg-gray-800/20 animate-pulse rounded-xl" />
            </div>
        );
    }

    if (chartData.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500">
                No commit data available for this period
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                    {topRepoNames.map((repoName) => {
                        const color = getRepoColor(repoName);
                        const gradId = `grad-${repoName.replace(/[^a-zA-Z0-9]/g, "_")}`;
                        return (
                            <linearGradient key={gradId} id={gradId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                                <stop offset="95%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                        );
                    })}
                    <linearGradient id="grad-total" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#e5e7eb" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="#e5e7eb" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1f2937" />
                <XAxis
                    dataKey="date"
                    stroke="#374151"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatTick}
                    minTickGap={40}
                />
                <YAxis
                    stroke="#374151"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={35}
                />
                <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ stroke: "#374151", strokeWidth: 1, strokeDasharray: "4 4" }}
                />
                <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ color: "#6b7280", paddingTop: "10px", fontSize: "11px" }}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                />

                {/* Render areas for top repos */}
                {topRepoNames.map((repoName) => {
                    const color = getRepoColor(repoName);
                    const gradId = `grad-${repoName.replace(/[^a-zA-Z0-9]/g, "_")}`;
                    return (
                        <Area
                            key={repoName}
                            type="monotone"
                            dataKey={repoName}
                            stroke={color}
                            strokeWidth={1.5}
                            strokeOpacity={opacity[repoName] ?? 0.7}
                            fill={`url(#${gradId})`}
                            fillOpacity={opacity[repoName] ?? 0.7}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0 }}
                            animationDuration={1000}
                            connectNulls
                        />
                    );
                })}

                {/* Total commits area (on top) */}
                <Area
                    type="monotone"
                    dataKey="total"
                    name="Total Commits"
                    stroke="#e5e7eb"
                    strokeWidth={2}
                    strokeOpacity={opacity["total"] ?? 1}
                    fill="url(#grad-total)"
                    fillOpacity={opacity["total"] ?? 1}
                    dot={false}
                    activeDot={{ r: 5, fill: "#fff", strokeWidth: 0 }}
                    animationDuration={1000}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
};
