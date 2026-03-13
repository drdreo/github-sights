import { Link } from "react-router-dom";
import {
    Github,
    ArrowRight,
    Clock,
    GitCommit,
    Users,
    GitPullRequest,
    Star,
    TrendingUp,
    BarChart3,
    Eye
} from "lucide-react";
import { useEffect, useState } from "react";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
    PieChart,
    Pie
} from "recharts";

const RECENT_OWNERS_KEY = "github-sights:recent-owners";

export function getRecentOwners(): string[] {
    try {
        const stored = localStorage.getItem(RECENT_OWNERS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

export function addRecentOwner(owner: string): void {
    const owners = getRecentOwners().filter((o) => o.toLowerCase() !== owner.toLowerCase());
    owners.unshift(owner);
    localStorage.setItem(RECENT_OWNERS_KEY, JSON.stringify(owners.slice(0, 10)));
}

// --- Fake showcase data ---

const SHOWCASE_REPOS = [
    {
        name: "react",
        owner: "facebook",
        stars: "228k",
        language: "JavaScript",
        langColor: "#f7df1e",
        description: "The library for web and native user interfaces.",
        commitData: generateCommitData(30, 15, 45),
        totalCommits: 1247,
        contributors: 89,
        prs: 342
    },
    {
        name: "next.js",
        owner: "vercel",
        stars: "131k",
        language: "TypeScript",
        langColor: "#3178c6",
        description: "The React framework for the web.",
        commitData: generateCommitData(30, 20, 60),
        totalCommits: 2103,
        contributors: 156,
        prs: 578
    },
    {
        name: "deno",
        owner: "denoland",
        stars: "101k",
        language: "Rust",
        langColor: "#dea584",
        description: "A modern runtime for JavaScript and TypeScript.",
        commitData: generateCommitData(30, 10, 35),
        totalCommits: 876,
        contributors: 64,
        prs: 213
    },
    {
        name: "tailwindcss",
        owner: "tailwindlabs",
        stars: "86k",
        language: "TypeScript",
        langColor: "#3178c6",
        description: "A utility-first CSS framework for rapid UI development.",
        commitData: generateCommitData(30, 8, 30),
        totalCommits: 654,
        contributors: 42,
        prs: 187
    }
];

function generateCommitData(days: number, min: number, max: number) {
    return Array.from({ length: days }, (_, i) => ({
        day: i,
        commits: Math.floor(min + Math.random() * (max - min) + Math.sin(i / 4) * 8)
    }));
}

const ACTIVITY_CHART_DATA = (() => {
    const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec"
    ];
    return months.map((m) => ({
        month: m,
        commits: Math.floor(200 + Math.random() * 600 + Math.sin(months.indexOf(m) / 2) * 150),
        prs: Math.floor(50 + Math.random() * 200 + Math.cos(months.indexOf(m) / 2) * 60)
    }));
})();

const LANGUAGE_DATA = [
    { name: "TypeScript", value: 42, color: "#3178c6" },
    { name: "JavaScript", value: 23, color: "#f7df1e" },
    { name: "Python", value: 18, color: "#3572a5" },
    { name: "Rust", value: 10, color: "#dea584" },
    { name: "Go", value: 7, color: "#00add8" }
];

const CONTRIBUTOR_DATA = Array.from({ length: 12 }, (_, i) => ({
    week: `W${i + 1}`,
    active: Math.floor(20 + Math.random() * 40 + Math.sin(i / 2) * 10)
}));

const FEATURES = [
    {
        icon: GitCommit,
        title: "Commit Analytics",
        desc: "Track commit frequency, patterns, and trends across all repositories."
    },
    {
        icon: Users,
        title: "Contributor Insights",
        desc: "Identify top contributors and analyze team participation."
    },
    {
        icon: TrendingUp,
        title: "Growth Trends",
        desc: "Visualize repository growth and activity over time."
    },
    {
        icon: BarChart3,
        title: "Language Breakdown",
        desc: "See the technology stack across your organization."
    }
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MiniTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-gray-800/95 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 shadow-xl">
            {payload.map((entry: any) => (
                <div key={entry.dataKey} style={{ color: entry.color }}>
                    {entry.name ?? entry.dataKey}: {entry.value}
                </div>
            ))}
        </div>
    );
};

function ShowcaseCard({ repo }: { repo: (typeof SHOWCASE_REPOS)[number] }) {
    return (
        <div className="group bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 hover:bg-gray-900/80 transition-all duration-300">
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

export default function LandingPage() {
    const [recentOwners, setRecentOwners] = useState<string[]>([]);

    useEffect(() => {
        setRecentOwners(getRecentOwners());
    }, []);

    return (
        <div className="min-h-screen bg-gray-950 selection:bg-blue-500/30 selection:text-white">
            {/* Hero Section */}
            <section className="relative overflow-hidden">
                {/* Background gradient blobs */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
                    <div className="absolute -bottom-20 -left-40 w-80 h-80 bg-purple-600/8 rounded-full blur-3xl" />
                </div>

                <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-16">
                    {/* Nav */}
                    <nav className="flex items-center justify-between mb-20">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-gray-900 rounded-xl border border-gray-800">
                                <Github className="w-5 h-5 text-gray-100" />
                            </div>
                            <span className="text-lg font-semibold text-gray-100 tracking-tight">
                                GitHub Sights
                            </span>
                        </div>
                        <Link
                            to="/setup"
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-lg transition-all duration-200"
                        >
                            Sign in
                            <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </nav>

                    {/* Hero content */}
                    <div className="text-center max-w-3xl mx-auto animate-in fade-in zoom-in duration-500">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-sm text-blue-400 mb-6">
                            <Eye className="w-3.5 h-3.5" />
                            Visualize your GitHub activity
                        </div>

                        <h1 className="text-5xl sm:text-6xl font-bold text-gray-100 tracking-tight mb-5 leading-tight">
                            Insights for your
                            <br />
                            <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
                                GitHub repositories
                            </span>
                        </h1>

                        <p className="text-lg text-gray-400 max-w-xl mx-auto mb-10 leading-relaxed">
                            Track commits, analyze contributors, and uncover trends across any
                            GitHub user or organization. Beautiful analytics, zero setup.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link
                                to="/setup"
                                className="inline-flex items-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 active:scale-[0.98]"
                            >
                                Get Started
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                            <a
                                href="https://github.com/drdreo/github-sights"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-7 py-3.5 text-gray-300 hover:text-white font-medium rounded-xl border border-gray-800 hover:border-gray-700 hover:bg-gray-900 transition-all duration-200"
                            >
                                <Github className="w-4 h-4" />
                                View Source
                            </a>
                        </div>
                    </div>

                    {/* Recent owners */}
                    {recentOwners.length > 0 && (
                        <div className="mt-10 flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                                <Clock className="w-3.5 h-3.5" />
                                Jump back in
                            </div>
                            <div className="flex flex-wrap justify-center gap-2">
                                {recentOwners.map((owner) => (
                                    <Link
                                        key={owner}
                                        to={`/${owner}/dashboard`}
                                        className="px-3.5 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300 hover:text-gray-100 hover:border-gray-700 hover:bg-gray-800 transition-all"
                                    >
                                        {owner}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Showcase Repositories */}
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

            {/* Analytics Preview Charts */}
            <section className="max-w-6xl mx-auto px-6 pb-20">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Activity over time - large chart */}
                    <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-sm font-medium text-gray-100">
                                    Activity Overview
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Commits & pull requests over time
                                </p>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-400">
                                <span className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-0.5 bg-blue-500 rounded-full" />
                                    Commits
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-0.5 bg-emerald-500 rounded-full" />
                                    PRs
                                </span>
                            </div>
                        </div>
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={ACTIVITY_CHART_DATA}>
                                    <defs>
                                        <linearGradient
                                            id="gradCommits"
                                            x1="0"
                                            y1="0"
                                            x2="0"
                                            y2="1"
                                        >
                                            <stop
                                                offset="5%"
                                                stopColor="#3b82f6"
                                                stopOpacity={0.2}
                                            />
                                            <stop
                                                offset="95%"
                                                stopColor="#3b82f6"
                                                stopOpacity={0}
                                            />
                                        </linearGradient>
                                        <linearGradient id="gradPRs" x1="0" y1="0" x2="0" y2="1">
                                            <stop
                                                offset="5%"
                                                stopColor="#10b981"
                                                stopOpacity={0.2}
                                            />
                                            <stop
                                                offset="95%"
                                                stopColor="#10b981"
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
                                        dataKey="commits"
                                        name="Commits"
                                        stroke="#3b82f6"
                                        strokeWidth={2}
                                        fill="url(#gradCommits)"
                                        dot={false}
                                        animationDuration={1000}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="prs"
                                        name="Pull Requests"
                                        stroke="#10b981"
                                        strokeWidth={2}
                                        fill="url(#gradPRs)"
                                        dot={false}
                                        animationDuration={1200}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Language breakdown - pie chart */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                        <h3 className="text-sm font-medium text-gray-100 mb-1">
                            Language Distribution
                        </h3>
                        <p className="text-xs text-gray-500 mb-4">Across all repositories</p>
                        <div className="h-40">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={LANGUAGE_DATA}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={65}
                                        paddingAngle={3}
                                        dataKey="value"
                                        animationDuration={1000}
                                        stroke="none"
                                    >
                                        {LANGUAGE_DATA.map((entry) => (
                                            <Cell key={entry.name} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<MiniTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
                            {LANGUAGE_DATA.map((lang) => (
                                <span
                                    key={lang.name}
                                    className="flex items-center gap-1.5 text-xs text-gray-400"
                                >
                                    <span
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: lang.color }}
                                    />
                                    {lang.name} {lang.value}%
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Second row: contributor activity + stats */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
                    {/* Active contributors bar chart */}
                    <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
                        <h3 className="text-sm font-medium text-gray-100 mb-1">
                            Active Contributors
                        </h3>
                        <p className="text-xs text-gray-500 mb-4">
                            Weekly active contributors over last quarter
                        </p>
                        <div className="h-44">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={CONTRIBUTOR_DATA}>
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        vertical={false}
                                        stroke="#1f2937"
                                    />
                                    <XAxis
                                        dataKey="week"
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
                                        width={30}
                                    />
                                    <Tooltip content={<MiniTooltip />} />
                                    <Bar
                                        dataKey="active"
                                        name="Contributors"
                                        fill="#8b5cf6"
                                        radius={[4, 4, 0, 0]}
                                        animationDuration={1000}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Quick stats */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col justify-between">
                        <div>
                            <h3 className="text-sm font-medium text-gray-100 mb-1">Sample Stats</h3>
                            <p className="text-xs text-gray-500 mb-5">
                                What you'll see at a glance
                            </p>
                        </div>
                        <div className="space-y-4">
                            {[
                                {
                                    label: "Total Commits",
                                    value: "4,880",
                                    change: "+12%",
                                    color: "text-blue-400"
                                },
                                {
                                    label: "Contributors",
                                    value: "351",
                                    change: "+8%",
                                    color: "text-purple-400"
                                },
                                {
                                    label: "Pull Requests",
                                    value: "1,320",
                                    change: "+23%",
                                    color: "text-emerald-400"
                                },
                                {
                                    label: "Repositories",
                                    value: "47",
                                    change: "+3",
                                    color: "text-amber-400"
                                }
                            ].map((stat) => (
                                <div key={stat.label} className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400">{stat.label}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-gray-100">
                                            {stat.value}
                                        </span>
                                        <span className={`text-xs ${stat.color}`}>
                                            {stat.change}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-5 h-12">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={CONTRIBUTOR_DATA}>
                                    <Line
                                        type="monotone"
                                        dataKey="active"
                                        stroke="#6366f1"
                                        strokeWidth={2}
                                        dot={false}
                                        animationDuration={1000}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className="max-w-6xl mx-auto px-6 pb-20">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {FEATURES.map((f) => (
                        <div
                            key={f.title}
                            className="bg-gray-900/50 border border-gray-800/60 rounded-xl p-5 hover:border-gray-700 transition-colors duration-300"
                        >
                            <div className="p-2.5 bg-gray-800 rounded-lg w-fit mb-3">
                                <f.icon className="w-5 h-5 text-blue-400" />
                            </div>
                            <h3 className="text-sm font-semibold text-gray-100 mb-1.5">
                                {f.title}
                            </h3>
                            <p className="text-xs text-gray-400 leading-relaxed">{f.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Bottom CTA */}
            <section className="max-w-6xl mx-auto px-6 pb-20">
                <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 via-purple-600/5 to-blue-600/5 pointer-events-none" />
                    <div className="relative">
                        <h2 className="text-2xl font-bold text-gray-100 mb-3">Ready to explore?</h2>
                        <p className="text-gray-400 mb-6 max-w-md mx-auto">
                            Connect your GitHub account and start visualizing your repository
                            analytics in seconds.
                        </p>
                        <Link
                            to="/setup"
                            className="inline-flex items-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 active:scale-[0.98]"
                        >
                            Get Started Free
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="max-w-6xl mx-auto px-6 pb-10">
                <div className="border-t border-gray-800/60 pt-6 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Github className="w-4 h-4" />
                        GitHub Sights
                    </div>
                    <div className="flex gap-6 text-sm text-gray-500">
                        <a
                            href="https://github.com/drdreo/github-sights"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-gray-300 transition-colors"
                        >
                            Source
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
