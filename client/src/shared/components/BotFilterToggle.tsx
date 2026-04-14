import { Bot } from "lucide-react";
import React from "react";

interface BotFilterToggleProps {
    hideBots: boolean;
    onChange: (value: boolean) => void;
}

export function BotFilterToggle({ hideBots, onChange }: BotFilterToggleProps) {
    return (
        <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-gray-400 hover:text-gray-200 transition-colors">
            <div className="relative">
                <input
                    type="checkbox"
                    checked={hideBots}
                    onChange={(e) => onChange(e.target.checked)}
                    className="sr-only peer"
                />
                <div className="w-8 h-4.5 bg-gray-700 rounded-full peer-checked:bg-blue-600 transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-gray-300 rounded-full peer-checked:translate-x-3.5 transition-transform" />
            </div>
            <Bot className="w-3.5 h-3.5" />
            <span>Hide bots</span>
        </label>
    );
}
