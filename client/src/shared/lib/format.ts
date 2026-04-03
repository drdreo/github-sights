/**
 * Format large numbers into compact human-readable strings.
 * 1_500_000 → "1.5M", 2_300 → "2.3K", 42 → "42"
 */
export function formatLoc(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

/**
 * Format seconds into a human-readable duration.
 * 45 → "45s", 125 → "2m", 3700 → "1h 2m", 90000 → "25h"
 */
export function formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
