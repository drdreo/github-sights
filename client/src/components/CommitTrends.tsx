import React from "react";
import { TrendingUp } from "lucide-react";
import { CommitActivityChart } from "./CommitActivityChart";
import type { RepoCommitTimeline } from "../types";

interface CommitTrendsProps {
    timelines: RepoCommitTimeline[];
    startDate: Date;
    endDate: Date;
    loading: boolean;
}

export function CommitTrends({ timelines, startDate, endDate, loading }: CommitTrendsProps) {
    return (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <div className="flex items-center gap-2 mb-5">
                <TrendingUp className="w-5 h-5 text-green-400" />
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                    Commit Trends
                </h3>
            </div>
            <div className="h-[350px]">
                <CommitActivityChart
                    timelines={timelines}
                    startDate={startDate}
                    endDate={endDate}
                    loading={loading}
                />
            </div>
        </div>
    );
}
