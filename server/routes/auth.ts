// ── GitHub OAuth Routes ───────────────────────────────────────────────────────
//
// GET  /api/auth/github   — Redirect to GitHub OAuth authorization page
// GET  /api/auth/callback — Handle OAuth callback, create session
// GET  /api/auth/me       — Return current session info
// POST /api/auth/logout   — Destroy session

import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createSession, getSession, deleteSession } from "../../shared/db/queries/sessions.ts";
import { errorResponse } from "../errors.ts";

const auth = new Hono();

const COOKIE_SESSION = "session_id";
const COOKIE_STATE = "oauth_state";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

function isProduction(): boolean {
    return Deno.env.get("ENVIRONMENT") !== "local";
}

function cookieOptions() {
    return {
        httpOnly: true,
        secure: isProduction(),
        sameSite: "Lax" as const,
        path: "/",
        maxAge: SESSION_MAX_AGE
    };
}

// ── GET /api/auth/github — Begin OAuth flow ──────────────────────────────────

auth.get("/api/auth/github", (c) => {
    const clientId = Deno.env.get("GITHUB_CLIENT_ID");
    const appUrl = Deno.env.get("APP_URL");

    if (!clientId || !appUrl) {
        return c.json({ error: "OAuth not configured" }, 500);
    }

    const state = crypto.randomUUID();

    setCookie(c, COOKIE_STATE, state, {
        httpOnly: true,
        secure: isProduction(),
        sameSite: "Lax",
        path: "/",
        maxAge: 600 // 10 minutes — state is short-lived
    });

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `${appUrl}/api/auth/callback`,
        scope: "read:user repo",
        state
    });

    return c.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// ── GET /api/auth/callback — Complete OAuth flow ─────────────────────────────

auth.get("/api/auth/callback", async (c) => {
    try {
        const clientId = Deno.env.get("GITHUB_CLIENT_ID");
        const clientSecret = Deno.env.get("GITHUB_CLIENT_SECRET");
        const appUrl = Deno.env.get("APP_URL");

        if (!clientId || !clientSecret || !appUrl) {
            return c.json({ error: "OAuth not configured" }, 500);
        }

        const code = c.req.query("code");
        const stateParam = c.req.query("state");
        const stateCookie = getCookie(c, COOKIE_STATE);

        // Validate state to prevent CSRF
        if (!stateParam || !stateCookie || stateParam !== stateCookie) {
            return c.json({ error: "Invalid OAuth state" }, 400);
        }

        // Clear state cookie
        deleteCookie(c, COOKIE_STATE, { path: "/" });

        if (!code) {
            return c.json({ error: "Missing authorization code" }, 400);
        }

        // Exchange code for access token
        const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                redirect_uri: `${appUrl}/api/auth/callback`
            })
        });

        if (!tokenResponse.ok) {
            return c.json({ error: "Failed to exchange code for token" }, 502);
        }

        const tokenData = (await tokenResponse.json()) as {
            access_token?: string;
            scope?: string;
            token_type?: string;
            error?: string;
            error_description?: string;
        };

        if (tokenData.error || !tokenData.access_token) {
            console.error(
                "[auth] Token exchange error:",
                tokenData.error,
                tokenData.error_description
            );
            return c.json(
                { error: tokenData.error_description ?? "OAuth token exchange failed" },
                400
            );
        }

        const accessToken = tokenData.access_token;
        const scopes = tokenData.scope ?? null;

        // Fetch authenticated user info
        const userResponse = await fetch("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"
            }
        });

        if (!userResponse.ok) {
            return c.json({ error: "Failed to fetch GitHub user info" }, 502);
        }

        const ghUser = (await userResponse.json()) as {
            id: number;
            login: string;
            avatar_url: string | null;
            type: string;
        };

        // Create session in DB
        const sessionId = crypto.randomUUID();
        await createSession({
            id: sessionId,
            github_id: ghUser.id,
            github_login: ghUser.login,
            avatar_url: ghUser.avatar_url ?? null,
            access_token: accessToken,
            scopes
        });

        // Set session cookie
        setCookie(c, COOKIE_SESSION, sessionId, cookieOptions());

        console.log(`[auth] Session created for ${ghUser.login} (github_id=${ghUser.id})`);

        return c.redirect("/setup");
    } catch (error) {
        return errorResponse(c, error);
    }
});

// ── GET /api/auth/me — Return current session info ───────────────────────────

auth.get("/api/auth/me", async (c) => {
    const sessionId = getCookie(c, COOKIE_SESSION);
    if (!sessionId) {
        return c.json({ authenticated: false });
    }

    const session = await getSession(sessionId);
    if (!session) {
        return c.json({ authenticated: false });
    }

    return c.json({
        authenticated: true,
        user: {
            login: session.github_login,
            avatar_url: session.avatar_url,
            github_id: session.github_id
        }
    });
});

// ── POST /api/auth/logout — Destroy session ──────────────────────────────────

auth.post("/api/auth/logout", async (c) => {
    const sessionId = getCookie(c, COOKIE_SESSION);
    if (sessionId) {
        await deleteSession(sessionId);
    }
    deleteCookie(c, COOKIE_SESSION, { path: "/" });
    return c.json({ authenticated: false });
});

export { auth };
