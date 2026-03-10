// ── Session Middleware ────────────────────────────────────────────────────────
//
// sessionMiddleware — reads session_id cookie on every request and attaches
//   the SessionRow to the context if valid. Does NOT block unauthenticated requests.
//
// requireAuth — middleware that returns 401 if no valid session is present.

import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { getSession } from "../../shared/db/queries/sessions.ts";
import type { SessionRow } from "../../shared/db/queries/sessions.ts";

// Extend Hono's context variable map so TypeScript knows the shape of "session".
declare module "hono" {
    interface ContextVariableMap {
        session: SessionRow | null;
    }
}

/** Global middleware — attaches session (or null) to every request context. */
export async function sessionMiddleware(c: Context, next: Next): Promise<void> {
    const sessionId = getCookie(c, "session_id");

    if (sessionId) {
        const session = await getSession(sessionId);
        c.set("session", session ?? null);
    } else {
        c.set("session", null);
    }

    await next();
}

/** Route middleware — returns 401 JSON if no valid session is attached. */
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
    const session = c.get("session");
    if (!session) {
        return c.json({ error: "Authentication required", code: "UNAUTHENTICATED" }, 401);
    }
    await next();
}
