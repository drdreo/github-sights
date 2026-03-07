import React from "react";
import { OverviewStats } from "../types";

interface LanguageBarProps {
    data: OverviewStats["languageBreakdown"];
}

export function LanguageBar({ data }: LanguageBarProps) {
    const total = data.reduce((acc, curr) => acc + curr.count, 0);

    return (
        <div className="w-full">
            <div className="flex h-3 w-full rounded-full overflow-hidden bg-gray-800 mb-2">
                {data.map((item) => {
                    const width = (item.count / total) * 100;
                    if (width === 0) return null;
                    return (
                        <div
                            key={item.language}
                            style={{ width: `${width}%`, backgroundColor: item.color }}
                            className="h-full transition-all duration-500"
                            title={`${item.language}: ${Math.round(width)}%`}
                        />
                    );
                })}
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                {data.map((item) => (
                    <div key={item.language} className="flex items-center gap-1.5">
                        <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: item.color }}
                        />
                        <span className="font-medium text-gray-300">{item.language}</span>
                        <span className="text-gray-500">
                            {Math.round((item.count / total) * 100)}%
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
