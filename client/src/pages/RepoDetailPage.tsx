import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { 
  ArrowLeft, 
  GitCommit, 
  GitPullRequest, 
  Users, 
  Star, 
  GitBranch, 
  ExternalLink, 
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle
} from 'lucide-react';

import { useRepo, useCommits, usePulls, useContributors, useConfig } from '../hooks/useGitHub';
import { LoadingSkeleton } from '../components/LoadingSkeleton';

export default function RepoDetailPage() {
  const { owner: paramOwner, repo: paramRepo } = useParams<{ owner: string; repo: string }>();
  const { data: config } = useConfig();
  
  const owner = paramOwner || config?.owner || '';
  const repoName = paramRepo || '';

  const [activeTab, setActiveTab] = useState<'commits' | 'pulls' | 'contributors'>('commits');

  // Fetch data
  const { data: repository, isLoading: repoLoading } = useRepo(owner, repoName);
  const { data: commits, isLoading: commitsLoading } = useCommits(owner, repoName);
  const { data: pulls, isLoading: pullsLoading } = usePulls(owner, repoName);
  const { data: contributors, isLoading: contribLoading } = useContributors(owner, repoName);

  if (repoLoading) {
    return (
      <div className="p-8 space-y-8 max-w-7xl mx-auto">
        <LoadingSkeleton className="h-8 w-32 mb-4" />
        <LoadingSkeleton className="h-48 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <LoadingSkeleton className="h-32 w-full rounded-xl" />
          <LoadingSkeleton className="h-32 w-full rounded-xl" />
          <LoadingSkeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!repository) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-screen text-center">
        <AlertCircle className="w-16 h-16 text-gray-600 mb-4" />
        <h1 className="text-2xl font-bold text-gray-100">Repository not found</h1>
        <Link to="/" className="mt-4 text-blue-600 hover:underline">Return to Dashboard</Link>
      </div>
    );
  }

  const TabButton = ({ id, label, icon: Icon, count }: { id: typeof activeTab, label: string, icon: any, count?: number }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium border-b-2 transition-all ${
        activeTab === id
          ? 'border-blue-400 text-blue-400 bg-blue-500/10'
          : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
      {count !== undefined && (
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          activeTab === id ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-800 text-gray-400'
        }`}>
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
        
        {/* Back Link */}
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-100 transition-colors font-medium group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Dashboard
        </Link>

        {/* Repo Header */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
             <GitBranch className="w-64 h-64 text-gray-100 transform rotate-12 translate-x-16 -translate-y-8" />
          </div>
          
          <div className="relative z-10">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold text-gray-100 tracking-tight">
                    {repository.name}
                  </h1>
                  <span className="bg-gray-800 text-gray-400 text-xs px-2.5 py-1 rounded-full border border-gray-700 font-medium">
                    {repository.private ? 'Private' : 'Public'}
                  </span>
                </div>
                <p className="text-gray-400 max-w-2xl text-lg leading-relaxed">
                  {repository.description || 'No description provided.'}
                </p>
              </div>
              
              <a 
                href={repository.html_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-900 rounded-lg hover:bg-white transition-all shadow-lg shadow-black/20 hover:shadow-black/30 font-medium"
              >
                View on GitHub
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-6 mt-8 text-sm">
              {repository.language && (
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
                  <span className="font-medium text-gray-300">{repository.language}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-gray-400 bg-gray-800 px-3 py-1.5 rounded-md border border-gray-700">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                <span className="font-semibold text-gray-100">{repository.stargazers_count}</span>
                <span className="text-gray-500">stars</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-400 bg-gray-800 px-3 py-1.5 rounded-md border border-gray-700">
                <GitBranch className="w-4 h-4 text-purple-500" />
                <span className="font-semibold text-gray-100">{repository.forks_count}</span>
                <span className="text-gray-500">forks</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-400 bg-gray-800 px-3 py-1.5 rounded-md border border-gray-700">
                <AlertCircle className="w-4 h-4 text-green-500" />
                <span className="font-semibold text-gray-100">{repository.open_issues_count}</span>
                <span className="text-gray-500">issues</span>
              </div>
              <div className="ml-auto text-gray-500 flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                Last updated {formatDistanceToNow(new Date(repository.updated_at))} ago
              </div>
            </div>
          </div>
        </div>

        {/* Content Tabs */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden min-h-[500px]">
          <div className="flex border-b border-gray-800">
            <TabButton 
              id="commits" 
              label="Commits" 
              icon={GitCommit} 
              count={commits?.length} 
            />
            <TabButton 
              id="pulls" 
              label="Pull Requests" 
              icon={GitPullRequest} 
              count={pulls?.length} 
            />
            <TabButton 
              id="contributors" 
              label="Contributors" 
              icon={Users} 
              count={contributors?.length} 
            />
          </div>

          <div className="p-0">
            {/* COMMITS TAB */}
            {activeTab === 'commits' && (
              <div className="divide-y divide-gray-800">
                {commitsLoading ? (
                  <div className="p-6 space-y-4">
                    <LoadingSkeleton variant="timeline" className="h-64" />
                  </div>
                ) : (
                  <>
                    {commits?.map((commit) => (
                      <div key={commit.sha} className="group p-6 hover:bg-gray-800/50 transition-colors flex gap-4 items-start">
                        <div className="mt-1 flex-shrink-0">
                          <img 
                            src={commit.author.avatar_url || 'https://github.com/ghost.png'} 
                            alt="" 
                            className="w-10 h-10 rounded-full border border-gray-700 bg-gray-800" 
                          />
                        </div>
                        <div className="flex-grow min-w-0">
                          <div className="flex items-start justify-between gap-4 mb-1">
                            <p className="text-sm font-semibold text-gray-100 line-clamp-1 group-hover:text-blue-400 transition-colors cursor-pointer">
                              {commit.message}
                            </p>
                            <a 
                              href={commit.html_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-shrink-0 font-mono text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded border border-gray-700 group-hover:border-blue-500/30 group-hover:text-blue-400 transition-all"
                            >
                              {commit.sha.substring(0, 7)}
                            </a>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span className="font-medium text-gray-300">{commit.author.name}</span>
                            <span>committed {formatDistanceToNow(new Date(commit.author.date))} ago</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {commits?.length === 0 && (
                      <div className="p-12 text-center text-gray-400">
                        No commits found in the last 90 days.
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* PULL REQUESTS TAB */}
            {activeTab === 'pulls' && (
              <div className="divide-y divide-gray-800">
                {pullsLoading ? (
                  <div className="p-6 space-y-4">
                    <LoadingSkeleton className="h-20 w-full" />
                    <LoadingSkeleton className="h-20 w-full" />
                  </div>
                ) : (
                  <>
                    {pulls?.map((pr) => (
                      <div key={pr.id} className="p-6 hover:bg-gray-800/50 transition-colors flex gap-4">
                        <div className="mt-1 flex-shrink-0">
                          {pr.state === 'open' ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                          ) : (
                            <XCircle className="w-5 h-5 text-purple-500" />
                          )}
                        </div>
                        <div className="flex-grow min-w-0">
                          <div className="flex items-start justify-between gap-4 mb-1">
                            <a 
                              href={pr.html_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-semibold text-gray-100 hover:text-blue-400 transition-colors line-clamp-1"
                            >
                              {pr.title}
                            </a>
                            <span className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                              pr.state === 'open' 
                                ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                                : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                            }`}>
                              {pr.state === 'open' ? 'Open' : 'Merged'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span>#{pr.number}</span>
                            <span>•</span>
                            <span>Opened by <span className="font-medium text-gray-300">{pr.user.login}</span></span>
                            <span>•</span>
                            <span>{format(new Date(pr.created_at), 'MMM d, yyyy')}</span>
                          </div>
                          {pr.additions !== undefined && (
                            <div className="mt-2 flex items-center gap-3 text-xs font-mono">
                              <span className="text-green-400">+{pr.additions}</span>
                              <span className="text-red-400">-{pr.deletions}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {pulls?.length === 0 && (
                      <div className="p-12 text-center text-gray-400">
                        No pull requests found.
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* CONTRIBUTORS TAB */}
            {activeTab === 'contributors' && (
              <div className="p-6">
                {contribLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <LoadingSkeleton className="h-32 w-full rounded-xl" />
                    <LoadingSkeleton className="h-32 w-full rounded-xl" />
                    <LoadingSkeleton className="h-32 w-full rounded-xl" />
                    <LoadingSkeleton className="h-32 w-full rounded-xl" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {contributors?.map((contributor, index) => (
                      <a 
                        key={contributor.login}
                        href={contributor.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex flex-col items-center text-center p-6 bg-gray-900 rounded-xl border border-gray-800 hover:border-blue-500/30 hover:shadow-lg hover:shadow-black/20 transition-all relative"
                      >
                        <span className="absolute top-3 left-3 text-xs font-mono text-gray-600">#{index + 1}</span>
                        <div className="relative mb-4">
                          <img 
                            src={contributor.avatar_url} 
                            alt={contributor.login} 
                            className="w-20 h-20 rounded-full border-4 border-gray-800 group-hover:border-blue-500/20 transition-colors shadow-sm"
                          />
                          <div className="absolute -bottom-2 -right-2 bg-gray-900 rounded-full p-1 shadow-sm border border-gray-800">
                             <div className="bg-green-500/20 text-green-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                               Top
                             </div>
                          </div>
                        </div>
                        <h3 className="text-base font-semibold text-gray-100 group-hover:text-blue-400 transition-colors">
                          {contributor.login}
                        </h3>
                        <div className="mt-3 flex items-center gap-1.5 text-sm text-gray-400 bg-gray-800 px-3 py-1 rounded-full group-hover:bg-blue-500/10 group-hover:text-blue-400 transition-colors">
                          <GitCommit className="w-3.5 h-3.5" />
                          <span className="font-semibold">{contributor.contributions}</span>
                          <span className="text-xs opacity-75">commits</span>
                        </div>
                      </a>
                    ))}
                    {contributors?.length === 0 && (
                      <div className="col-span-full p-12 text-center text-gray-400">
                        No contributors found.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
