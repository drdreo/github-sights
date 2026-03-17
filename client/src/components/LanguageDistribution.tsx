import React from "react";
import { Code2 } from "lucide-react";
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
            <div className="flex items-center gap-2 mb-5">
                <Code2 className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                    Languages
                </h3>
            </div>
            {loading ? (
                <LoadingSkeleton className="h-8 w-full rounded-full" />
            ) : (
                <LanguageBar data={stats?.languageBreakdown || []} />
            )}
        </div>
    );
}
