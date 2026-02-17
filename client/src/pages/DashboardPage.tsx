import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { subDays, format } from 'date-fns';
import { 
  GitCommit, 
  ArrowRight, 
  ExternalLink,
  GitBranch,
  GitFork,
  Star,
  Code,
  RefreshCw,
  TrendingUp
} from 'lucide-react';

import { useConfig, useRepos, useStats, useCommitTimelines, useSync } from '../hooks/useGitHub';
import { StatCards } from '../components/StatCards';
import { CommitTimeline } from '../components/CommitTimeline';
import { CommitActivityChart } from '../components/CommitActivityChart';
import { TimeRangeSelector } from '../components/TimeRangeSelector';
import { LanguageBar } from '../components/LanguageBar';
import { LoadingSkeleton } from '../components/LoadingSkeleton';

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState({ 
    startDate: subDays(new Date(), 30), 
    endDate: new Date() 
  });

  const { data: config, isLoading: configLoading } = useConfig();
  const owner = config?.owner || '';

  const since = dateRange.startDate.toISOString();
  const until = dateRange.endDate.toISOString();

  const { data: repos, isLoading: reposLoading } = useRepos(owner);
  const { data: stats, isLoading: statsLoading } = useStats(owner, since, until);
  const { data: timelines, isLoading: timelinesLoading } = useCommitTimelines(owner, since, until);

  // Background sync: fills commit gaps from last fetch → now, then refreshes queries
  const { isSyncing } = useSync(owner, since, until);

  // Sort repos: most recently pushed first, then by stars as tiebreaker
  const sortedRepos = useMemo(() => {
    if (!repos) return [];
    return [...repos].sort((a, b) => {
      const aDate = a.pushed_at || a.updated_at;
      const bDate = b.pushed_at || b.updated_at;
      const dateCompare = bDate.localeCompare(aDate);
      if (dateCompare !== 0) return dateCompare;
      return b.stargazers_count - a.stargazers_count;
    });
  }, [repos]);

  if (configLoading) {
    return (
      <div className="p-8 space-y-8 max-w-7xl mx-auto">
        <LoadingSkeleton className="h-12 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <LoadingSkeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* 1. Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-100 tracking-tight flex items-center gap-2">
              {owner}
              <span className="text-gray-500 font-normal text-xl">/ Dashboard</span>
              {isSyncing && (
                <RefreshCw className="w-4 h-4 text-blue-400 animate-spin ml-1" />
              )}
            </h1>
          </div>
          <TimeRangeSelector 
            startDate={dateRange.startDate} 
            endDate={dateRange.endDate} 
            onChange={setDateRange} 
          />
        </div>

        {/* 2. StatCards */}
        <div className="grid grid-cols-1 gap-6">
          <StatCards stats={stats} loading={statsLoading} />
        </div>

        {/* 3. Language Breakdown */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
            <Code className="w-5 h-5 text-gray-500" />
            Language Distribution
          </h2>
          {statsLoading ? (
            <LoadingSkeleton className="h-8 w-full rounded-full" />
          ) : (
            <div className="mt-2">
              <LanguageBar data={stats?.languageBreakdown || []} />
            </div>
          )}
        </div>

        {/* 4. Commit Trends */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-100 mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-gray-500" />
            Commit Trends
          </h2>
          <div className="h-[350px]">
            <CommitActivityChart 
              timelines={timelines || []} 
              startDate={dateRange.startDate} 
              endDate={dateRange.endDate}
              loading={timelinesLoading}
            />
          </div>
        </div>

        {/* 5. Commit Activity (HERO) */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
              <GitCommit className="w-5 h-5 text-gray-500" />
              Commit Activity
            </h2>
          </div>
          <div>
            <CommitTimeline 
              timelines={timelines || []} 
              startDate={dateRange.startDate} 
              endDate={dateRange.endDate}
              loading={timelinesLoading}
            />
          </div>
        </div>

        {/* 6. Repositories Grid */}
        <div>
          <h2 className="text-xl font-semibold text-gray-100 mb-6 flex items-center gap-2">
            Repositories
            <span className="bg-gray-800 text-gray-400 text-sm py-0.5 px-2.5 rounded-full font-medium">
              {sortedRepos.length}
            </span>
          </h2>

          {reposLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <LoadingSkeleton key={i} className="h-48 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedRepos.map((repo) => (
                <Link 
                   key={repo.id} 
                   to={`/repo/${owner}/${repo.name}`}
                   className={`group bg-gray-900 rounded-xl border border-gray-800 p-6 hover:shadow-lg hover:shadow-black/20 hover:border-blue-500/30 transition-all duration-200 flex flex-col h-full ${repo.fork ? 'opacity-60' : ''}`}
                 >
                   <div className="flex items-start justify-between mb-4">
                     <div className="flex items-center gap-3 overflow-hidden">
                       <div className={`p-2 rounded-lg group-hover:bg-blue-500/20 transition-colors flex-shrink-0 ${repo.fork ? 'bg-gray-800 text-gray-500' : 'bg-blue-500/10 text-blue-400'}`}>
                        {repo.fork ? <GitFork className="w-5 h-5" /> : <GitBranch className="w-5 h-5" />}
                      </div>
                       <div className="overflow-hidden">
                         <h3 className="font-semibold text-gray-100 group-hover:text-blue-400 transition-colors text-lg truncate">
                           {repo.name}
                         </h3>
                         {repo.fork && (
                           <span className="text-xs text-gray-500">Forked</span>
                        )}
                      </div>
                    </div>
                     {repo.html_url && (
                       <a 
                         href={repo.html_url}
                         target="_blank"
                         rel="noopener noreferrer"
                         className="text-gray-500 hover:text-gray-300 p-1 rounded-md hover:bg-gray-800 transition-colors flex-shrink-0"
                         onClick={(e) => e.stopPropagation()}
                       >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                   
                   <p className="text-gray-400 text-sm mb-6 line-clamp-2 flex-grow">
                    {repo.description || 'No description provided'}
                  </p>

                   <div className="flex items-center justify-between text-sm text-gray-400 pt-4 border-t border-gray-800 mt-auto">
                    <div className="flex items-center gap-4">
                      {repo.language && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                          <span>{repo.language}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4" />
                        <span>{repo.stargazers_count}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <GitBranch className="w-4 h-4" />
                        <span>{repo.forks_count}</span>
                      </div>
                    </div>
                     <span className="text-xs text-gray-500">
                      {repo.updated_at && format(new Date(repo.updated_at), 'MMM d')}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
