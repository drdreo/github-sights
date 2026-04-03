// ── Octokit Factory ───────────────────────────────────────────────────────────

import { Octokit } from "octokit";
import { getBudget, RateLimitBudget } from "./rate-limit.ts";

export { RateLimitBudget };

const REQUEST_TIMEOUT_MS = 30_000; // 30s per HTTP request

export function createOctokit(token: string): Octokit {
    const octokit = new Octokit({
        auth: token,
        request: { timeout: REQUEST_TIMEOUT_MS },
        throttle: {
            onRateLimit: (
                retryAfter: number,
                options: { method: string; url: string },
                _octokit: Octokit,
                retryCount: number
            ) => {
                console.warn(
                    `[rate-limit] ${options.method} ${options.url} — retry after ${retryAfter}s (attempt ${retryCount + 1})`
                );
                return retryCount < 2;
            },
            onSecondaryRateLimit: (
                retryAfter: number,
                options: { method: string; url: string },
                _octokit: Octokit,
                retryCount: number
            ) => {
                console.warn(
                    `[secondary-rate-limit] ${options.method} ${options.url} — retry after ${retryAfter}s (attempt ${retryCount + 1})`
                );
                return retryCount < 1;
            }
        }
    });

    // Passively track rate limit headers on every response
    octokit.hook.after("request", (response) => {
        const budget = getBudget(octokit);
        // deno-lint-ignore no-explicit-any
        budget.update((response as any).headers ?? {});
    });

    return octokit;
}

/** Verify a token by calling /user. Returns the authenticated user's login. */
export async function verifyToken(octokit: Octokit): Promise<{ login: string; scopes: string[] }> {
    console.log("[github] Verifying token");
    const response = await octokit.rest.users.getAuthenticated();
    const scopes = (response.headers["x-oauth-scopes"] || "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    return { login: response.data.login, scopes };
}
