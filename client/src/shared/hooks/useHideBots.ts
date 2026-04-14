import { useState } from "react";

const STORAGE_KEY = "github-sights:hide-bots";

function readStorage(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
        return false;
    }
}

export function useHideBots() {
    const [hideBots, setHideBots] = useState(readStorage);

    const toggle = (value: boolean) => {
        setHideBots(value);
        try {
            localStorage.setItem(STORAGE_KEY, String(value));
        } catch {
            // ignore
        }
    };

    return [hideBots, toggle] as const;
}
