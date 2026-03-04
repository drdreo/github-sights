import React from "react";
import { LanguageBar } from "./LanguageBar";
import { LoadingSkeleton } from "./LoadingSkeleton";
import type { OverviewStats } from "../types";

interface LanguageDistributionProps {
    stats: OverviewStats | undefined;
    loading: boolean;
}

export function LanguageDistribution({ stats, loading }: LanguageDistributionProps) {
    return (
        <div>
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
                Languages
            </h3>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                {loading ? (
                    <LoadingSkeleton className="h-8 w-full rounded-full" />
                ) : (
                    <LanguageBar data={stats?.languageBreakdown || []} />
                )}
            </div>
        </div>
    );
}
