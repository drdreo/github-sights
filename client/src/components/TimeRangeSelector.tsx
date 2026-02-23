import React from "react";
import { Calendar } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

interface TimeRangeSelectorProps {
    startDate: Date;
    endDate: Date;
    onChange: (range: { startDate: Date; endDate: Date }) => void;
    className?: string;
}

const PRESETS = [
    { label: "7d", days: 7 },
    { label: "30d", days: 30 },
    { label: "90d", days: 90 },
    { label: "1y", days: 365 },
];

export function TimeRangeSelector({
    startDate,
    endDate,
    onChange,
    className = "",
}: TimeRangeSelectorProps) {
    const handlePresetClick = (days: number) => {
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
    const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const activePreset = PRESETS.find((p) => Math.abs(p.days - diffDays) <= 1)?.label;

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

            <div className="h-6 w-px bg-gray-700 hidden sm:block" />

            <div className="flex items-center gap-2 text-sm text-gray-400">
                <Calendar className="w-4 h-4 text-gray-500" />
                <input
                    type="date"
                    value={format(startDate, "yyyy-MM-dd")}
                    onChange={(e) => handleDateChange("start", e.target.value)}
                    className="border-none bg-transparent p-0 focus:ring-0 text-gray-300 font-medium cursor-pointer"
                />
                <span className="text-gray-500">to</span>
                <input
                    type="date"
                    value={format(endDate, "yyyy-MM-dd")}
                    onChange={(e) => handleDateChange("end", e.target.value)}
                    className="border-none bg-transparent p-0 focus:ring-0 text-gray-300 font-medium cursor-pointer"
                />
            </div>
        </div>
    );
}
