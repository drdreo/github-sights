import React from "react";
import { GitCommit } from "lucide-react";
import { LoadingSkeleton } from "./LoadingSkeleton";
import type { Contributor } from "../types";

interface ContributorGridProps {
    contributors: Contributor[] | undefined;
    loading: boolean;
}

export function ContributorGrid({ contributors, loading }: ContributorGridProps) {
    if (loading) {
        return (
            <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                    <LoadingSkeleton key={i} className="h-32 w-full rounded-xl" />
                ))}
            </div>
        );
    }

    if (!contributors?.length) {
        return <div className="p-12 text-center text-gray-400">No contributors found.</div>;
    }

    return (
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {contributors.map((contributor, index) => (
                <a
                    key={contributor.login}
                    href={contributor.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col items-center text-center p-6 bg-gray-900 rounded-xl border border-gray-800 hover:border-blue-500/30 hover:shadow-lg hover:shadow-black/20 transition-all relative"
                >
                    <span className="absolute top-3 left-3 text-xs font-mono text-gray-600">
                        #{index + 1}
                    </span>
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
        </div>
    );
}
