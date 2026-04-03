// ── Constants & Shared Helpers ────────────────────────────────────────────────

/**
 * Sanitize a date string into a valid GitHub GitTimestamp (ISO-8601 without milliseconds).
 * Returns null if the input is falsy or unparseable.
 */
export function toGitTimestamp(value: string | null | undefined): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    // GitHub GitTimestamp rejects milliseconds — strip them
    return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// deno-lint-ignore no-explicit-any
export function logGraphQLRateLimit(response: any): void {
    const rl = response?.rateLimit;
    if (rl && rl.remaining <= 200) {
        console.warn(
            `[graphql-rate-limit] ${rl.remaining}/${rl.limit} remaining — resets at ${rl.resetAt}`
        );
    }
}

export const LANGUAGE_COLORS: Record<string, string> = {
    TypeScript: "#3178c6",
    JavaScript: "#f1e05a",
    Python: "#3572A5",
    Java: "#b07219",
    Go: "#00ADD8",
    Rust: "#dea584",
    Ruby: "#701516",
    PHP: "#4F5D95",
    "C++": "#f34b7d",
    C: "#555555",
    "C#": "#178600",
    Swift: "#F05138",
    Kotlin: "#A97BFF",
    Dart: "#00B4AB",
    Shell: "#89e051",
    HTML: "#e34c26",
    CSS: "#563d7c",
    Vue: "#41b883",
    Svelte: "#ff3e00"
};
