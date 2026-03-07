import { Hono } from "hono";
import { getConfig, setConfig, clearConfig } from "../config.ts";
import { createOctokit, verifyToken } from "../scraper/index.ts";
import { badCredentials, tokenMissingScopes, validationError, errorResponse } from "../errors.ts";

const config = new Hono();

// ── GET /api/config/:owner — Check if a specific owner is configured ────────

config.get("/api/config/:owner", (c) => {
    const { owner } = c.req.param();
    const current = getConfig(owner);
    if (current) {
        return c.json({
            configured: true,
            owner: current.owner,
            ownerType: current.ownerType,
            syncSince: current.syncSince ?? null
        });
    }
    return c.json({ configured: false });
});

// ── POST /api/config — Set up GitHub credentials ────────────────────────────

config.post("/api/config", async (c) => {
    try {
        const body = await c.req.json<{
            token?: string;
            owner?: string;
            ownerType?: string;
            syncSince?: string;
        }>();
        const { token, owner, ownerType, syncSince } = body;

        // ── Validation ──────────────────────────────────────────────
        if (!token) {
            throw validationError(
                "Missing required field: token",
                "Provide a GitHub personal access token (starts with 'ghp_' or 'github_pat_')."
            );
        }

        if (!owner) {
            throw validationError(
                "Missing required field: owner",
                "Provide the GitHub username or organization name to fetch repos for."
            );
        }

        if (!ownerType || (ownerType !== "user" && ownerType !== "org")) {
            throw validationError(
                'Invalid ownerType — must be "user" or "org"',
                'Set ownerType to "user" for personal accounts or "org" for GitHub organizations.'
            );
        }

        // Quick format check on token prefix
        if (
            !token.startsWith("ghp_") &&
            !token.startsWith("github_pat_") &&
            !token.startsWith("gho_") &&
            !token.startsWith("ghs_")
        ) {
            throw validationError(
                "Token format not recognized",
                "GitHub tokens typically start with 'ghp_' (classic PAT) or 'github_pat_' (fine-grained). Check that you copied the full token."
            );
        }

        // ── Verify token against GitHub ─────────────────────────────
        const octokit = createOctokit(token);

        let authResult: { login: string; scopes: string[] };
        try {
            authResult = await verifyToken(octokit);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);

            if (message.includes("Bad credentials")) {
                throw badCredentials(
                    "Token was rejected by GitHub. It may have expired or been revoked."
                );
            }

            throw badCredentials(message);
        }

        // Check required scopes for classic PATs (fine-grained tokens don't return x-oauth-scopes)
        if (token.startsWith("ghp_") && authResult.scopes.length > 0) {
            const hasRepo = authResult.scopes.some((s) => s === "repo" || s === "public_repo");
            if (!hasRepo) {
                throw tokenMissingScopes(["repo"]);
            }
        }

        // ── Store config ────────────────────────────────────────────
        await setConfig({
            token,
            owner,
            ownerType: ownerType as "user" | "org",
            syncSince
        });

        console.log(
            `[config] Configured for ${ownerType}:${owner} (authenticated as ${authResult.login})`
        );

        return c.json({
            configured: true,
            owner,
            ownerType,
            authenticatedAs: authResult.login
        });
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── DELETE /api/config/:owner — Clear stored config for an owner ────────────

config.delete("/api/config/:owner", async (c) => {
    const { owner } = c.req.param();
    await clearConfig(owner);
    console.log(`[config] Configuration cleared for ${owner}`);
    return c.json({ configured: false });
});

export { config };
