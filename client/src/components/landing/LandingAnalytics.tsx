import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { subDays } from "date-fns";
import { CommitTimeline } from "../CommitTimeline";
import { RepoRanking } from "../dashboard/RepoRanking";
import { ACTIVITY_CHART_DATA, CONTRIBUTORS_MOCK, REPO_RANKING_MOCK, SWIMLANE_MOCK } from "./mockData";

interface TooltipEntry {
    dataKey: string;
    name?: string;
    value: number;
    color?: string;
}

const MiniTooltip = ({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-gray-800/95 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 shadow-xl">
            {payload.map((entry) => (
                <div key={entry.dataKey} style={{ color: entry.color }}>
                    {entry.name ?? entry.dataKey}: {entry.value}
                </div>
            ))}
        </div>
    );
};

export function LandingAnalytics() {
    return (
        <section className="max-w-6xl mx-auto px-6 pb-20">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Main content – left 2 columns */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Activity over time - large chart */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-sm font-medium text-gray-100">
                                    Activity Overview
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Total commits vs top repositories
                                </p>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-400">
                                <span className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-0.5 bg-gray-200 rounded-full" />
                                    Total
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-0.5 bg-blue-500 rounded-full" />
                                    react
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-0.5 bg-purple-500 rounded-full" />
                                    next.js
                                </span>
                            </div>
                        </div>
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={ACTIVITY_CHART_DATA}>
                                    <defs>
                                        <linearGradient
                                            id="gradTotal"
                                            x1="0"
                                            y1="0"
                                            x2="0"
                                            y2="1"
                                        >
                                            <stop
                                                offset="5%"
                                                stopColor="#e5e7eb"
                                                stopOpacity={0.12}
                                            />
                                            <stop
                                                offset="95%"
                                                stopColor="#e5e7eb"
                                                stopOpacity={0}
                                            />
                                        </linearGradient>
                                        <linearGradient id="gradReact" x1="0" y1="0" x2="0" y2="1">
                                            <stop
                                                offset="5%"
                                                stopColor="#3b82f6"
                                                stopOpacity={0.15}
                                            />
                                            <stop
                                                offset="95%"
                                                stopColor="#3b82f6"
                                                stopOpacity={0}
                                            />
                                        </linearGradient>
                                        <linearGradient id="gradNext" x1="0" y1="0" x2="0" y2="1">
                                            <stop
                                                offset="5%"
                                                stopColor="#a855f7"
                                                stopOpacity={0.15}
                                            />
                                            <stop
                                                offset="95%"
                                                stopColor="#a855f7"
                                                stopOpacity={0}
                                            />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        vertical={false}
                                        stroke="#1f2937"
                                    />
                                    <XAxis
                                        dataKey="month"
                                        stroke="#374151"
                                        tick={{ fill: "#6b7280", fontSize: 11 }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        stroke="#374151"
                                        tick={{ fill: "#6b7280", fontSize: 11 }}
                                        tickLine={false}
                                        axisLine={false}
                                        width={35}
                                    />
                                    <Tooltip content={<MiniTooltip />} />
                                    <Area
                                        type="monotone"
                                        dataKey="react"
                                        name="react"
                                        stroke="#3b82f6"
                                        strokeWidth={1.5}
                                        fill="url(#gradReact)"
                                        dot={false}
                                        animationDuration={1000}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="next.js"
                                        name="next.js"
                                        stroke="#a855f7"
                                        strokeWidth={1.5}
                                        fill="url(#gradNext)"
                                        dot={false}
                                        animationDuration={1200}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="total"
                                        name="Total Commits"
                                        stroke="#e5e7eb"
                                        strokeWidth={2}
                                        fill="url(#gradTotal)"
                                        dot={false}
                                        animationDuration={1000}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Commit Activity Swim Lane */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                        <div className="p-5">
                            <h3 className="text-sm font-medium text-gray-100">
                                Commit Activity
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Real-time commit swim lane across repositories
                            </p>
                        </div>
                        <div className="[&>div]:!border-y-0 [&>div]:!min-h-[250px] border-t border-gray-800">
                            <CommitTimeline
                                timelines={SWIMLANE_MOCK}
                                startDate={subDays(new Date(), 13)}
                                endDate={new Date()}
                                loading={false}
                            />
                        </div>
                    </div>
                </div>

                {/* Right column: Contributors + Repo ranking */}
                <div className="space-y-4">
                    {/* Active contributors list */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                        <h3 className="text-sm font-medium text-gray-100 mb-1">
                            Top Contributors
                        </h3>
                        <p className="text-xs text-gray-500 mb-4">
                            All-time commit leaders
                        </p>
                        <div className="space-y-1">
                            {CONTRIBUTORS_MOCK.map((contributor, i) => {
                                const rank = i + 1;
                                const pct = (contributor.commits / CONTRIBUTORS_MOCK[0].commits) * 100;
                                const rankColors: Record<number, string> = {
                                    1: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
                                    2: "text-gray-300 bg-gray-400/10 border-gray-400/20",
                                    3: "text-orange-400 bg-orange-500/10 border-orange-500/20"
                                };
                                const colorClass = rankColors[rank] || "text-gray-500 bg-gray-800/50 border-gray-700";

                                return (
                                    <div
                                        key={contributor.login}
                                        className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-gray-800/50 transition-colors duration-150 group"
                                    >
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border shrink-0 ${colorClass}`}>
                                            {rank}
                                        </div>
                                        <img
                                            src={`https://github.com/${contributor.login}.png?size=64`}
                                            alt={contributor.login}
                                            className="w-8 h-8 rounded-full ring-2 ring-gray-800 shrink-0"
                                            loading="lazy"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors truncate">
                                                    {contributor.login}
                                                </span>
                                                <span className="text-xs text-gray-400 font-mono shrink-0 ml-2">
                                                    {contributor.commits.toLocaleString()} commits
                                                </span>
                                            </div>
                                            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden flex">
                                                <div
                                                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-1000 ease-out"
                                                    style={{ width: `${pct}%`, backgroundSize: `${100 / (pct / 100)}% 100%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Repo ranking */}
                    <div>
                        <RepoRanking 
                            timelines={REPO_RANKING_MOCK} 
                            owner="showcase" 
                            limit={4} 
                            loading={false} 
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}