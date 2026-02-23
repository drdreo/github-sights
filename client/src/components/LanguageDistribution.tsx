import React from "react";
import { Code } from "lucide-react";
import { LanguageBar } from "./LanguageBar";
import { LoadingSkeleton } from "./LoadingSkeleton";
import type { OverviewStats } from "../types";

interface LanguageDistributionProps {
    stats: OverviewStats | undefined;
    loading: boolean;
}

export function LanguageDistribution({ stats, loading }: LanguageDistributionProps) {
    return (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
                <Code className="w-5 h-5 text-gray-500" />
                Language Distribution
            </h2>
            {loading ? (
                <LoadingSkeleton className="h-8 w-full rounded-full" />
            ) : (
                <div className="mt-2">
                    <LanguageBar data={stats?.languageBreakdown || []} />
                </div>
            )}
        </div>
    );
}
