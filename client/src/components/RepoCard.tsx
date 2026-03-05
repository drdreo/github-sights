import React from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Code, ExternalLink, GitBranch, GitCommit, GitFork, GitPullRequest, Star } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { Repository } from "../types";
import type { RepoSnapshotStats } from "./RepoGrid";
import { getLanguageColor } from "../lib/languageColors";

function IconTooltip({ children, label }: { children: React.ReactNode; label: string }) {
    return (
        <Tooltip.Root>
            <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
            <Tooltip.Portal>
                <Tooltip.Content
                    className="z-50 bg-gray-900/95 backdrop-blur text-white text-xs rounded-lg px-2.5 py-1.5 shadow-xl border border-gray-800"
                    sideOffset={5}
                    side="top"
                >
                    {label}
                </Tooltip.Content>
            </Tooltip.Portal>
        </Tooltip.Root>
    );
}

function formatCompact(n: number): string {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}k`;
    return n.toString();
}

interface RepoCardProps {
    repo: Repository;
    owner: string;
    totalCommits?: number;
    snapshot?: RepoSnapshotStats;
}

export function RepoCard({ repo, owner, totalCommits, snapshot }: RepoCardProps) {
    return (
        <div
            className={`group relative bg-gray-900 rounded-xl border border-gray-800 hover:shadow-lg hover:shadow-black/20 hover:border-blue-500/30 transition-all duration-200 flex flex-col h-full ${repo.fork ? "opacity-60" : ""}`}
        >
            <Link to={`/${owner}/repo/${repo.name}`} className="flex flex-col flex-grow p-6">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div
                            className={`p-2 rounded-lg group-hover:bg-blue-500/20 transition-colors flex-shrink-0 ${repo.fork ? "bg-gray-800 text-gray-500" : "bg-blue-500/10 text-blue-400"}`}
                        >
                            {repo.fork ? (
                                <GitFork className="w-5 h-5" />
                            ) : (
                                <GitBranch className="w-5 h-5" />
                            )}
                        </div>
                        <div className="overflow-hidden">
                            <h3 className="font-semibold text-gray-100 group-hover:text-blue-400 transition-colors text-lg truncate">
                                {repo.name}
                            </h3>
                            {repo.fork && <span className="text-xs text-gray-500">Forked</span>}
                        </div>
                    </div>
                    {/* Spacer to keep layout aligned with the external link button */}
                    {repo.html_url && <div className="w-6 h-6 flex-shrink-0" />}
                </div>

                <div className="mb-4 flex-grow">
                    <p className="text-gray-400 text-sm line-clamp-2">
                        {repo.description || "No description provided"}
                    </p>
                    {repo.language && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
                            <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: getLanguageColor(repo.language) }}
                            />
                            <span>{repo.language}</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center text-xs text-gray-400 pt-3 border-t border-gray-800 mt-auto">
                    {/* Repo stats */}
                    <IconTooltip label="Stars">
                        <div className="flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 text-gray-500" />
                            <span>{formatCompact(repo.stargazers_count)}</span>
                        </div>
                    </IconTooltip>
                    <span className="mx-1.5 text-gray-700">&middot;</span>
                    <IconTooltip label="Forks">
                        <div className="flex items-center gap-1">
                            <GitFork className="w-3.5 h-3.5 text-gray-500" />
                            <span>{formatCompact(repo.forks_count)}</span>
                        </div>
                    </IconTooltip>

                    <span className="mx-2 h-3 w-px bg-gray-800" />

                    {/* Activity stats */}
                    <IconTooltip label="Pull Requests">
                        <div className="flex items-center gap-1">
                            <GitPullRequest className="w-3.5 h-3.5 text-gray-500" />
                            <span>{formatCompact(snapshot?.totalPRs ?? 0)}</span>
                        </div>
                    </IconTooltip>
                    <span className="mx-1.5 text-gray-700">&middot;</span>
                    <IconTooltip label="Commits">
                        <div className="flex items-center gap-1">
                            <GitCommit className="w-3.5 h-3.5 text-gray-500" />
                            <span>{formatCompact(totalCommits ?? 0)}</span>
                        </div>
                    </IconTooltip>
                    <span className="mx-1.5 text-gray-700">&middot;</span>
                    <IconTooltip label={snapshot ? `+${formatCompact(snapshot.totalAdditions)} / -${formatCompact(snapshot.totalDeletions)} lines` : "Lines changed"}>
                        <div className="flex items-center gap-1">
                            <Code className="w-3.5 h-3.5 text-gray-500" />
                            <span>{formatCompact((snapshot?.totalAdditions ?? 0) - (snapshot?.totalDeletions ?? 0))}</span>
                        </div>
                    </IconTooltip>

                    {repo.updated_at && (
                        <IconTooltip
                            label={"Last updated on " + format(new Date(repo.updated_at), "dd.MM.yyyy")}
                        >
                            <span className="ml-auto text-gray-600">
                                {format(new Date(repo.updated_at), "MMM d")}
                            </span>
                        </IconTooltip>
                    )}
                </div>
            </Link>
            {repo.html_url && (
                <a
                    href={repo.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute top-5 right-5 text-gray-500 hover:text-gray-300 p-1 rounded-md hover:bg-gray-800 transition-colors z-10"
                >
                    <ExternalLink className="w-4 h-4" />
                </a>
            )}
        </div>
    );
}
