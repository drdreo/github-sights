import React from 'react';
import { GitCommit } from 'lucide-react';
import { CommitTimeline } from './CommitTimeline';
import type { RepoCommitTimeline } from '../types';

interface CommitActivityProps {
  timelines: RepoCommitTimeline[];
  startDate: Date;
  endDate: Date;
  loading: boolean;
}

export function CommitActivity({ timelines, startDate, endDate, loading }: CommitActivityProps) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-6">
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

