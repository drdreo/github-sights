import { Github, Star, GitCommit, Users, GitPullRequest } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import { SHOWCASE_REPOS } from "./mockData";

export function ShowcaseCard({ repo }: { repo: (typeof SHOWCASE_REPOS)[number] }) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            {/* Repo header */}
            <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-0.5">
                        <Github className="w-3.5 h-3.5 shrink-0" />
                        {repo.owner}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-100 truncate">{repo.name}</h3>
                </div>
                <div className="flex items-center gap-1 text-sm text-amber-400 shrink-0 ml-2">
                    <Star className="w-3.5 h-3.5" />
                    {repo.stars}
                </div>
            </div>
            <p className="text-sm text-gray-400 mb-4 line-clamp-2">{repo.description}</p>

            {/* Mini sparkline */}
            <div className="h-16 mb-4 -mx-1">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={repo.commitData}>
                        <defs>
                            <linearGradient id={`grad-${repo.name}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Area
                            type="monotone"
                            dataKey="commits"
                            stroke="#3b82f6"
                            strokeWidth={1.5}
                            fill={`url(#grad-${repo.name})`}
                            dot={false}
                            animationDuration={1200}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                    <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: repo.langColor }}
                    />
                    {repo.language}
                </span>
                <span className="flex items-center gap-1">
                    <GitCommit className="w-3 h-3" />
                    {repo.totalCommits.toLocaleString()}
                </span>
                <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {repo.contributors}
                </span>
                <span className="flex items-center gap-1">
                    <GitPullRequest className="w-3 h-3" />
                    {repo.prs}
                </span>
            </div>
        </div>
    );
}

export function LandingShowcase() {
    return (
        <section className="max-w-6xl mx-auto px-6 pb-20">
            <div className="text-center mb-10">
                <h2 className="text-2xl font-bold text-gray-100 mb-2">
                    Explore popular repositories
                </h2>
                <p className="text-gray-400">
                    See what GitHub Sights can reveal about trending open-source projects.
                </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {SHOWCASE_REPOS.map((repo) => (
                    <ShowcaseCard key={repo.name} repo={repo} />
                ))}
            </div>
        </section>
    );
}