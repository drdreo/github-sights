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
            <h2 className="text-lg font-semibold text-gray-100 mb-6 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-gray-500" />
                Commit Trends
            </h2>
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
