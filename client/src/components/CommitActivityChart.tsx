import React, { useMemo, useState, useCallback } from "react";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    CartesianGrid
} from "recharts";
import type { Payload } from "recharts/types/component/DefaultLegendContent";
import { format, eachDayOfInterval } from "date-fns";
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
            <p style={{ color: "#e5e7eb", marginBottom: "0.25rem" }}>{label}</p>
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
                displayDate: format(day, "MMM d - E"),
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
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
                <XAxis
                    dataKey="displayDate"
                    stroke="#4b5563"
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                    tickLine={{ stroke: "#4b5563" }}
                    axisLine={{ stroke: "#4b5563" }}
                    minTickGap={30}
                />
                <YAxis
                    stroke="#4b5563"
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                    tickLine={{ stroke: "#4b5563" }}
                    axisLine={{ stroke: "#4b5563" }}
                    allowDecimals={false}
                />
                <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ stroke: "#6b7280", strokeWidth: 1, strokeDasharray: "4 4" }}
                />
                <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    wrapperStyle={{ color: "#9ca3af", paddingTop: "10px" }}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                />

                {/* Render lines for top repos */}
                {topRepoNames.map((repoName) => (
                    <Line
                        key={repoName}
                        type="monotone"
                        dataKey={repoName}
                        stroke={getRepoColor(repoName)}
                        strokeWidth={1.5}
                        strokeOpacity={opacity[repoName] ?? 0.7}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0 }}
                        animationDuration={800}
                        connectNulls
                    />
                ))}

                {/* Total commits line (on top) */}
                <Line
                    type="monotone"
                    dataKey="total"
                    name="Total Commits"
                    stroke="#e5e7eb"
                    strokeWidth={2.5}
                    strokeOpacity={opacity["total"] ?? 1}
                    dot={false}
                    activeDot={{ r: 6, fill: "#fff" }}
                    animationDuration={800}
                />
            </LineChart>
        </ResponsiveContainer>
    );
};
