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
 * 45 → "45s", 125 → "2m", 3700 → "1h 2m", 90000 → "1d 1h", 700000 → "1w 1d 2h"
 */
export function formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const totalMins = Math.round(seconds / 60);
    if (totalMins < 60) return `${totalMins}m`;
    const totalHours = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (totalHours < 24) return m > 0 ? `${totalHours}h ${m}m` : `${totalHours}h`;
    const totalDays = Math.floor(totalHours / 24);
    const h = totalHours % 24;
    if (totalDays < 7) {
        const parts = [`${totalDays}d`];
        if (h > 0) parts.push(`${h}h`);
        return parts.join(" ");
    }
    const w = Math.floor(totalDays / 7);
    const d = totalDays % 7;
    const parts = [`${w}w`];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    return parts.join(" ");
}
