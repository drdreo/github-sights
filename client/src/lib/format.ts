/**
 * Format large numbers into compact human-readable strings.
 * 1_500_000 → "1.5M", 2_300 → "2.3K", 42 → "42"
 */
export function formatLoc(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}
