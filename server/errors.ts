// ── Server Error Utilities ──────────────────────────────────────────────────
//
// Re-exports all error types/factories from shared, plus the hono-specific
// errorResponse middleware for route handlers.

import type { Context } from "hono";

// Re-export everything from shared errors
export {
    ErrorCode,
    ApiError,
    notConfigured,
    badCredentials,
    tokenMissingScopes,
    validationError,
    rateLimited,
    notFound,
    githubApiError
} from "../shared/errors.ts";
export type { ErrorCodeType } from "../shared/errors.ts";

import { ApiError, ErrorCode } from "../shared/errors.ts";

// ── Error Handler Middleware (hono-specific) ────────────────────────────────

export function errorResponse(c: Context, error: unknown) {
    if (error instanceof ApiError) {
        return c.json(
            {
                error: error.message,
                code: error.code,
                ...(error.details && { details: error.details }),
                ...(error.hint && { hint: error.hint })
            },
            error.statusCode as 400
        );
    }

    // Unexpected errors
    const message = error instanceof Error ? error.message : String(error);
    console.error("[unhandled]", error);

    return c.json(
        {
            error: "An unexpected error occurred",
            code: ErrorCode.INTERNAL_ERROR,
            details: message
        },
        500
    );
}
