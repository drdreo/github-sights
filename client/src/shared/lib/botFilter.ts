/**
 * Known bot / automation accounts that don't follow the `[bot]` or `-bot`
 * naming convention but are clearly not human contributors.
 */
const KNOWN_BOTS = new Set([
    // CI / dependency bots
    "dependabot",
    "renovate",
    "github-actions",
    "snyk-bot",
    "codecov",
    "greenkeeper",
    // GitHub Copilot
    "copilot",
    "copilot-swe-agent",
    // AI coding agents
    "claude-code",
    "claude",
    "sysyphus",
    "devin",
    "aider",
    "sweep-ai",
    "coderabbitai",
    "opencode",
]);

/**
 * Returns true if the contributor login looks like a bot account.
 * Matches GitHub app accounts (suffix `[bot]`), common bot naming
 * patterns (e.g. `renovate-bot`), and well-known automation accounts.
 */
export function isBot(login: string): boolean {
    const lower = login.toLowerCase();
    return (
        lower.endsWith("[bot]") || // GitHub app accounts: dependabot[bot]
        lower.endsWith("-bot") || // e.g. renovate-bot
        lower.startsWith("bot-") ||
        lower === "bot" ||
        KNOWN_BOTS.has(lower)
    );
}
