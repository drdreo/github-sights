import { subDays, format } from "date-fns";
import { GitCommit, Users, TrendingUp, BarChart3 } from "lucide-react";
import { RepoCommitTimeline, Repository } from "../../types";

// --- Fake showcase data ---
export const SHOWCASE_REPOS = [
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

export const REPO_RANKING_MOCK: RepoCommitTimeline[] = SHOWCASE_REPOS.map((repo) => {
    const now = new Date();
    return {
        repo: {
            name: repo.name,
            language: repo.language,
        } as Repository,
        totalCommits: repo.totalCommits,
        daily: repo.commitData.map((d, i) => ({
            date: format(subDays(now, 30 - i), "yyyy-MM-dd"),
            count: d.commits,
            commits: []
        }))
    };
});

export const ACTIVITY_CHART_DATA = (() => {
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
    return months.map((m, i) => {
        const react = Math.floor(100 + Math.random() * 200 + Math.sin(i / 2) * 50);
        const nextjs = Math.floor(50 + Math.random() * 150 + Math.cos(i / 2) * 40);
        const other = Math.floor(50 + Math.random() * 100);
        return {
            month: m,
            total: react + nextjs + other,
            react,
            "next.js": nextjs
        };
    });
})();

export const SWIMLANE_MOCK: RepoCommitTimeline[] = (() => {
    const FAKE_AUTHORS = [
        { name: "Sophie", login: "sophiebits", avatar_url: "https://github.com/sophiebits.png" },
        { name: "Dan", login: "gaearon", avatar_url: "https://github.com/gaearon.png" },
        { name: "Lee", login: "leerob", avatar_url: "https://github.com/leerob.png" },
        { name: "Adam", login: "adamwathan", avatar_url: "https://github.com/adamwathan.png" },
        { name: "Rich", login: "Rich-Harris", avatar_url: "https://github.com/Rich-Harris.png" }
    ];

    const FAKE_MESSAGES = [
        "fix: resolve hydration error on server render",
        "feat: add new experimental API",
        "chore: update dependencies",
        "docs: clarify usage of new hook",
        "perf: optimize render cycle",
        "fix: edge case in flexbox layout",
        "refactor: extract common utility functions",
        "test: add missing unit tests",
        "style: format codebase with prettier"
    ];

    const now = new Date();
    const days = 14;

    const generateCommitsForRepo = (repoName: string, lang: string, maxPerDay: number) => {
        let totalCommits = 0;
        const daily = Array.from({ length: days }, (_, i) => {
            const date = subDays(now, days - 1 - i);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            // Less commits on weekend
            const numCommits = Math.floor(Math.random() * (isWeekend ? maxPerDay / 2 + 1 : maxPerDay));
            totalCommits += numCommits;
            
            const commits = Array.from({ length: numCommits }, () => {
                const author = FAKE_AUTHORS[Math.floor(Math.random() * FAKE_AUTHORS.length)];
                const msg = FAKE_MESSAGES[Math.floor(Math.random() * FAKE_MESSAGES.length)];
                const sha = Math.random().toString(36).substring(2, 9);
                return {
                    sha,
                    message: msg,
                    author: {
                        name: author.name,
                        email: `${author.login}@example.com`,
                        date: date.toISOString(),
                        login: author.login,
                        avatar_url: author.avatar_url
                    },
                    committer: {
                        name: author.name,
                        email: `${author.login}@example.com`,
                        date: date.toISOString(),
                        login: author.login,
                        avatar_url: author.avatar_url
                    },
                    html_url: `https://github.com/example/${repoName}/commit/${sha}`,
                    stats: {
                        additions: Math.floor(Math.random() * 100),
                        deletions: Math.floor(Math.random() * 50),
                        total: 0
                    }
                } as any;
            });
            
            return {
                date: format(date, "yyyy-MM-dd"),
                count: numCommits,
                commits
            };
        });

        return {
            repo: {
                id: Math.random(),
                name: repoName,
                full_name: `example/${repoName}`,
                language: lang
            } as Repository,
            totalCommits,
            daily
        };
    };

    return [
        generateCommitsForRepo("react", "JavaScript", 4),
        generateCommitsForRepo("next.js", "TypeScript", 5),
        generateCommitsForRepo("tailwindcss", "TypeScript", 3)
    ];
})();

export const CONTRIBUTORS_MOCK = [
    { login: "torvalds", commits: 45213 },
    { login: "ThePrimeagen", commits: 23145 },
    { login: "geohot", commits: 18402 },
    { login: "ry", commits: 15320 },
    { login: "bashbunni", commits: 9876 },
];

export const FEATURES = [
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