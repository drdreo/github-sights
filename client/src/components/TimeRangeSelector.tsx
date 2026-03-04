import React from "react";
import { Calendar } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

interface TimeRangeSelectorProps {
    startDate: Date | null;
    endDate: Date | null;
    onChange: (range: { startDate: Date | null; endDate: Date | null }) => void;
    showAllTime?: boolean;
    className?: string;
}

const BASE_PRESETS: { label: string; days: number | null }[] = [
    { label: "7d", days: 7 },
    { label: "30d", days: 30 },
    { label: "90d", days: 90 },
    { label: "1y", days: 365 }
];

export function TimeRangeSelector({
    startDate,
    endDate,
    onChange,
    showAllTime = false,
    className = ""
}: TimeRangeSelectorProps) {
    const PRESETS = showAllTime
        ? [...BASE_PRESETS, { label: "All", days: null }]
        : BASE_PRESETS;

    const handlePresetClick = (days: number | null) => {
        if (days === null) {
            onChange({ startDate: null, endDate: null });
            return;
        }
        const end = endOfDay(new Date());
        const start = startOfDay(subDays(end, days));
        onChange({ startDate: start, endDate: end });
    };

    const handleDateChange = (type: "start" | "end", value: string) => {
        const date = new Date(value);
        if (isNaN(date.getTime())) return;

        if (type === "start") {
            onChange({ startDate: startOfDay(date), endDate });
        } else {
            onChange({ startDate, endDate: endOfDay(date) });
        }
    };

    // Determine active preset
    const isAllTime = startDate === null || endDate === null;
    const diffDays = isAllTime ? null : Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const activePreset = isAllTime
        ? "All"
        : PRESETS.find((p) => p.days !== null && diffDays !== null && Math.abs(p.days - diffDays) <= 1)?.label;

    return (
        <div
            className={`flex flex-col sm:flex-row items-center gap-4 bg-gray-900 p-2 rounded-lg border border-gray-800 ${className}`}
        >
            <div className="flex items-center gap-1 bg-gray-800 p-1 rounded-md">
                {PRESETS.map((preset) => (
                    <button
                        key={preset.label}
                        onClick={() => handlePresetClick(preset.days)}
                        className={`
              px-3 py-1.5 text-sm font-medium rounded transition-all
              ${
                  activePreset === preset.label
                      ? "bg-gray-700 text-blue-400 shadow-sm"
                      : "text-gray-400 hover:text-gray-100 hover:bg-gray-700/50"
              }
            `}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>

            <div className={`h-6 w-px bg-gray-700 hidden sm:block transition-opacity ${isAllTime ? "opacity-0" : ""}`} />

            <div className={`flex items-center gap-2 text-sm transition-opacity ${isAllTime ? "opacity-30 pointer-events-none" : "text-gray-400"}`}>
                <Calendar className="w-4 h-4 text-gray-500" />
                <input
                    type="date"
                    value={startDate ? format(startDate, "yyyy-MM-dd") : ""}
                    onChange={(e) => handleDateChange("start", e.target.value)}
                    disabled={isAllTime}
                    className="border-none bg-transparent p-0 focus:ring-0 text-gray-300 font-medium cursor-pointer disabled:cursor-default"
                />
                <span className="text-gray-500">to</span>
                <input
                    type="date"
                    value={endDate ? format(endDate, "yyyy-MM-dd") : ""}
                    onChange={(e) => handleDateChange("end", e.target.value)}
                    disabled={isAllTime}
                    className="border-none bg-transparent p-0 focus:ring-0 text-gray-300 font-medium cursor-pointer disabled:cursor-default"
                />
            </div>
        </div>
    );
}
