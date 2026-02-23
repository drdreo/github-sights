import React from "react";
import { GitCommit } from "lucide-react";
import { CommitTimeline } from "./CommitTimeline";
import type { RepoCommitTimeline } from "../types";

interface CommitActivityProps {
    timelines: RepoCommitTimeline[];
    startDate: Date;
    endDate: Date;
    loading: boolean;
}

export function CommitActivity({ timelines, startDate, endDate, loading }: CommitActivityProps) {
    return (
        <div>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-4">
                <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
                    <GitCommit className="w-5 h-5 text-gray-500" />
                    Commit Activity
                </h2>
            </div>
            <CommitTimeline
                timelines={timelines}
                startDate={startDate}
                endDate={endDate}
                loading={loading}
            />
        </div>
    );
}
