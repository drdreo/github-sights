import React from "react";
import { useSyncProgress } from "../hooks/useSyncProgress";
import { SyncProgressBar } from "./SyncProgressBar";

interface SyncBannerProps {
    owner: string;
}

/**
 * Self-contained sync progress banner.
 * Polls the progress endpoint and renders inline when a sync is active.
 * Use on pages that don't trigger syncs themselves (repos, contributors).
 */
export function SyncBanner({ owner }: SyncBannerProps) {
    const { data: progress } = useSyncProgress(owner);

    if (!progress?.active && !progress?.errors?.length) return null;

    return <SyncProgressBar progress={progress} barWidth="w-24" />;
}
