import {
  Repository,
  Commit,
  PullRequest,
  Contributor,
  OverviewStats,
  RepoCommitTimeline,
  DailyCommitActivity,
} from '../types';
import { subDays, format, addDays } from 'date-fns';

// --- Helpers ---
const avatars = [
  'https://avatars.githubusercontent.com/u/1?v=4',
  'https://avatars.githubusercontent.com/u/2?v=4',
  'https://avatars.githubusercontent.com/u/3?v=4',
  'https://avatars.githubusercontent.com/u/4?v=4',
  'https://avatars.githubusercontent.com/u/5?v=4',
  'https://avatars.githubusercontent.com/u/6?v=4',
  'https://avatars.githubusercontent.com/u/7?v=4',
  'https://avatars.githubusercontent.com/u/8?v=4',
];

const users = [
  { login: 'octocat', avatar_url: avatars[0], html_url: 'https://github.com/octocat' },
  { login: 'defunkt', avatar_url: avatars[1], html_url: 'https://github.com/defunkt' },
  { login: 'mojombo', avatar_url: avatars[2], html_url: 'https://github.com/mojombo' },
  { login: 'wycats', avatar_url: avatars[3], html_url: 'https://github.com/wycats' },
  { login: 'ezmobius', avatar_url: avatars[4], html_url: 'https://github.com/ezmobius' },
  { login: 'ivey', avatar_url: avatars[5], html_url: 'https://github.com/ivey' },
  { login: 'evanphx', avatar_url: avatars[6], html_url: 'https://github.com/evanphx' },
  { login: 'vanpelt', avatar_url: avatars[7], html_url: 'https://github.com/vanpelt' },
];

const commitMessages = [
  'fix: resolve null pointer in auth middleware',
  'feat: add user dashboard',
  'chore: update dependencies',
  'refactor: extract validation logic',
  'style: fix padding on mobile',
  'docs: update README with setup instructions',
  'test: add integration tests for payment flow',
  'perf: optimize image loading',
  'ci: fix github actions workflow',
  'feat: implement dark mode',
  'fix: handle edge case in login',
  'refactor: simplify state management',
];

// --- Mock Repositories ---
export const mockRepos: Repository[] = [
  {
    id: 1,
    name: 'react-dashboard',
    full_name: 'acme/react-dashboard',
    description: 'A beautiful dashboard built with React and Tailwind',
    html_url: 'https://github.com/acme/react-dashboard',
    private: false,
    language: 'TypeScript',
    stargazers_count: 1240,
    forks_count: 350,
    open_issues_count: 12,
    default_branch: 'main',
    created_at: '2023-01-15T10:00:00Z',
    updated_at: '2023-10-20T14:30:00Z',
    pushed_at: '2023-10-21T09:15:00Z',
    fork: false,
    owner: users[0],
  },
  {
    id: 2,
    name: 'api-gateway',
    full_name: 'acme/api-gateway',
    description: 'High performance API gateway service',
    html_url: 'https://github.com/acme/api-gateway',
    private: true,
    language: 'Go',
    stargazers_count: 85,
    forks_count: 12,
    open_issues_count: 4,
    default_branch: 'master',
    created_at: '2023-03-10T11:20:00Z',
    updated_at: '2023-10-19T16:45:00Z',
    pushed_at: '2023-10-21T10:00:00Z',
    fork: false,
    owner: users[0],
  },
  {
    id: 3,
    name: 'data-pipeline',
    full_name: 'acme/data-pipeline',
    description: 'Scalable data processing pipeline',
    html_url: 'https://github.com/acme/data-pipeline',
    private: false,
    language: 'Python',
    stargazers_count: 530,
    forks_count: 89,
    open_issues_count: 23,
    default_branch: 'main',
    created_at: '2022-11-05T08:00:00Z',
    updated_at: '2023-10-18T13:10:00Z',
    pushed_at: '2023-10-20T15:20:00Z',
    fork: false,
    owner: users[0],
  },
  {
    id: 4,
    name: 'design-system',
    full_name: 'acme/design-system',
    description: 'Shared UI components and tokens',
    html_url: 'https://github.com/acme/design-system',
    private: false,
    language: 'TypeScript',
    stargazers_count: 310,
    forks_count: 45,
    open_issues_count: 8,
    default_branch: 'main',
    created_at: '2023-02-20T09:30:00Z',
    updated_at: '2023-10-21T11:00:00Z',
    pushed_at: '2023-10-21T11:30:00Z',
    fork: false,
    owner: users[0],
  },
  {
    id: 5,
    name: 'core-utils',
    full_name: 'acme/core-utils',
    description: 'Core utilities for Rust microservices',
    html_url: 'https://github.com/acme/core-utils',
    private: true,
    language: 'Rust',
    stargazers_count: 42,
    forks_count: 5,
    open_issues_count: 1,
    default_branch: 'main',
    created_at: '2023-05-12T14:15:00Z',
    updated_at: '2023-10-15T09:45:00Z',
    pushed_at: '2023-10-19T10:20:00Z',
    fork: false,
    owner: users[0],
  },
  {
    id: 6,
    name: 'mobile-app',
    full_name: 'acme/mobile-app',
    description: 'iOS and Android app built with React Native',
    html_url: 'https://github.com/acme/mobile-app',
    private: false,
    language: 'TypeScript',
    stargazers_count: 890,
    forks_count: 120,
    open_issues_count: 34,
    default_branch: 'main',
    created_at: '2023-01-05T10:00:00Z',
    updated_at: '2023-10-20T12:00:00Z',
    pushed_at: '2023-10-21T14:45:00Z',
    fork: false,
    owner: users[0],
  },
];

// --- Mock Commits & Timeline ---
const generateCommits = (repoName: string, days: number = 90): Commit[] => {
  const commits: Commit[] = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = subDays(today, i);
    const dateStr = format(date, 'yyyy-MM-dd');
    
    // Weighted random for activity: some days have many, some 0
    const activityLevel = Math.random();
    let count = 0;
    if (activityLevel > 0.8) count = Math.floor(Math.random() * 5) + 3; // Busy day: 3-7 commits
    else if (activityLevel > 0.5) count = Math.floor(Math.random() * 3) + 1; // Normal day: 1-3 commits
    // Else 0 commits (20% chance of empty day)

    for (let j = 0; j < count; j++) {
      const author = users[Math.floor(Math.random() * users.length)];
      commits.push({
        sha: Math.random().toString(36).substring(2, 12),
        message: commitMessages[Math.floor(Math.random() * commitMessages.length)],
        author: {
          name: author.login,
          email: `${author.login}@example.com`,
          date: new Date(date.setHours(Math.floor(Math.random() * 24))).toISOString(),
          login: author.login,
          avatar_url: author.avatar_url,
        },
        committer: {
          name: author.login,
          email: `${author.login}@example.com`,
          date: new Date(date.setHours(Math.floor(Math.random() * 24))).toISOString(),
          login: author.login,
          avatar_url: author.avatar_url,
        },
        html_url: `https://github.com/acme/${repoName}/commit/mocksha`,
        stats: {
          additions: Math.floor(Math.random() * 100),
          deletions: Math.floor(Math.random() * 50),
          total: Math.floor(Math.random() * 150),
        },
        repo_name: repoName,
      });
    }
  }
  return commits.sort((a, b) => new Date(b.author.date).getTime() - new Date(a.author.date).getTime());
};

export const mockCommitTimelines: RepoCommitTimeline[] = mockRepos.map((repo) => {
  const commits = generateCommits(repo.name);
  
  // Group by day for heatmap
  const dailyMap = new Map<string, DailyCommitActivity>();
  const today = new Date();
  
  // Initialize last 90 days with 0
  for (let i = 0; i < 90; i++) {
    const d = subDays(today, i);
    const dateStr = format(d, 'yyyy-MM-dd');
    dailyMap.set(dateStr, { date: dateStr, count: 0, commits: [] });
  }

  commits.forEach(c => {
    const dateStr = format(new Date(c.author.date), 'yyyy-MM-dd');
    if (dailyMap.has(dateStr)) {
      const entry = dailyMap.get(dateStr)!;
      entry.count++;
      entry.commits.push(c);
    }
  });

  return {
    repo,
    daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    totalCommits: commits.length,
  };
});

// --- Mock PRs ---
export const mockPullRequests: PullRequest[] = [
  {
    id: 101,
    number: 42,
    title: 'feat: add virtual scrolling to list',
    state: 'open',
    html_url: 'https://github.com/acme/react-dashboard/pull/42',
    user: users[1],
    created_at: subDays(new Date(), 2).toISOString(),
    updated_at: subDays(new Date(), 1).toISOString(),
    closed_at: null,
    merged_at: null,
    draft: false,
    additions: 450,
    deletions: 120,
    changed_files: 8,
    base: { ref: 'main' },
    head: { ref: 'feat/virtual-scroll' },
  },
  {
    id: 102,
    number: 41,
    title: 'fix: mobile menu z-index issue',
    state: 'closed', // Merged
    html_url: 'https://github.com/acme/react-dashboard/pull/41',
    user: users[2],
    created_at: subDays(new Date(), 5).toISOString(),
    updated_at: subDays(new Date(), 4).toISOString(),
    closed_at: subDays(new Date(), 4).toISOString(),
    merged_at: subDays(new Date(), 4).toISOString(),
    draft: false,
    additions: 12,
    deletions: 4,
    changed_files: 2,
    base: { ref: 'main' },
    head: { ref: 'fix/z-index' },
  },
  {
    id: 103,
    number: 156,
    title: 'chore: upgrade react-query to v5',
    state: 'open',
    html_url: 'https://github.com/acme/data-pipeline/pull/156',
    user: users[3],
    created_at: subDays(new Date(), 1).toISOString(),
    updated_at: new Date().toISOString(),
    closed_at: null,
    merged_at: null,
    draft: true,
    additions: 1200,
    deletions: 890,
    changed_files: 45,
    base: { ref: 'main' },
    head: { ref: 'chore/upgrade-deps' },
  },
  {
    id: 104,
    number: 8,
    title: 'feat: add oauth2 support',
    state: 'closed',
    html_url: 'https://github.com/acme/api-gateway/pull/8',
    user: users[0],
    created_at: subDays(new Date(), 10).toISOString(),
    updated_at: subDays(new Date(), 8).toISOString(),
    closed_at: subDays(new Date(), 8).toISOString(),
    merged_at: subDays(new Date(), 8).toISOString(),
    draft: false,
    additions: 340,
    deletions: 50,
    changed_files: 12,
    base: { ref: 'master' },
    head: { ref: 'feat/oauth' },
  },
];

// --- Mock Contributors ---
export const mockContributors: Contributor[] = users.map(u => ({
  login: u.login,
  avatar_url: u.avatar_url,
  html_url: u.html_url,
  contributions: Math.floor(Math.random() * 500) + 20,
})).sort((a, b) => b.contributions - a.contributions);

// --- Mock Overview Stats ---
const totalCommits = mockCommitTimelines.reduce((acc, t) => acc + t.totalCommits, 0);

export const mockOverviewStats: OverviewStats = {
  totalRepos: mockRepos.length,
  totalCommits,
  totalPRs: 145,
  openPRs: 12,
  mergedPRs: 128,
  uniqueContributors: 18,
  mostActiveRepo: {
    name: 'react-dashboard',
    commits: mockCommitTimelines.find(t => t.repo.name === 'react-dashboard')?.totalCommits || 0,
  },
  longestStreak: 14,
  currentStreak: 3,
  avgCommitsPerDay: Math.round((totalCommits / 90) * 10) / 10,
  topContributors: mockContributors.slice(0, 5),
  languageBreakdown: [
    { language: 'TypeScript', count: 3, color: '#3178C6' },
    { language: 'Python', count: 1, color: '#3572A5' },
    { language: 'Go', count: 1, color: '#00ADD8' },
    { language: 'Rust', count: 1, color: '#DEA584' },
  ],
};
