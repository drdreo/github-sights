import React from "react";
import { RefreshCw } from "lucide-react";
import { TimeRangeSelector } from "./TimeRangeSelector";

interface DateRange {
    startDate: Date;
    endDate: Date;
}

interface DashboardHeaderProps {
    owner: string;
    isSyncing: boolean;
    dateRange: DateRange;
    onDateRangeChange: (range: DateRange) => void;
}

export function DashboardHeader({
    owner,
    isSyncing,
    dateRange,
    onDateRangeChange
}: DashboardHeaderProps) {
    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold text-gray-100 tracking-tight flex items-center gap-2">
                    {owner}
                    <span className="text-gray-500 font-normal text-xl">/ Dashboard</span>
                    {isSyncing && <RefreshCw className="w-4 h-4 text-blue-400 animate-spin ml-1" />}
                </h1>
            </div>
            <TimeRangeSelector
                startDate={dateRange.startDate}
                endDate={dateRange.endDate}
                onChange={onDateRangeChange}
            />
        </div>
    );
}
