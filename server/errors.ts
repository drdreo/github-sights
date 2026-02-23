import type { Context } from "hono";

// ── Error Codes ─────────────────────────────────────────────────────────────────

export const ErrorCode = {
    NOT_CONFIGURED: "NOT_CONFIGURED",
    BAD_CREDENTIALS: "BAD_CREDENTIALS",
    TOKEN_MISSING_SCOPES: "TOKEN_MISSING_SCOPES",
    VALIDATION_ERROR: "VALIDATION_ERROR",
    RATE_LIMITED: "RATE_LIMITED",
    NOT_FOUND: "NOT_FOUND",
    GITHUB_API_ERROR: "GITHUB_API_ERROR",
    INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

// ── API Error ───────────────────────────────────────────────────────────────────

export class ApiError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly code: ErrorCodeType,
        message: string,
        public readonly details?: string,
        public readonly hint?: string,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

// ── Error Factories ─────────────────────────────────────────────────────────────

export function notConfigured(): ApiError {
    return new ApiError(
        401,
        ErrorCode.NOT_CONFIGURED,
        "GitHub API is not configured",
        "No API token has been set up yet.",
        "POST a valid GitHub token to /api/config before making other requests.",
    );
}

export function badCredentials(ghMessage?: string): ApiError {
    return new ApiError(
        401,
        ErrorCode.BAD_CREDENTIALS,
        "GitHub authentication failed",
        ghMessage || "The provided token was rejected by GitHub.",
        "Ensure your token starts with 'ghp_' (classic) or 'github_pat_' (fine-grained) and hasn't expired. You can generate a new one at https://github.com/settings/tokens",
    );
}

export function tokenMissingScopes(required: string[]): ApiError {
    return new ApiError(
        403,
        ErrorCode.TOKEN_MISSING_SCOPES,
        "Token is missing required permissions",
        `Required scopes: ${required.join(", ")}`,
        "Edit your token at https://github.com/settings/tokens and add the missing scopes, then reconfigure.",
    );
}

export function validationError(message: string, hint?: string): ApiError {
    return new ApiError(400, ErrorCode.VALIDATION_ERROR, message, undefined, hint);
}

export function rateLimited(retryAfterSecs?: number): ApiError {
    return new ApiError(
        429,
        ErrorCode.RATE_LIMITED,
        "GitHub API rate limit exceeded",
        retryAfterSecs ? `Retry after ${retryAfterSecs} seconds.` : undefined,
        "Wait a moment and try again, or use a token with higher rate limits.",
    );
}

export function notFound(resource: string, identifier: string): ApiError {
    return new ApiError(
        404,
        ErrorCode.NOT_FOUND,
        `${resource} not found: ${identifier}`,
        undefined,
        "Check the owner/repo name for typos. If it's a private repo, ensure your token has access.",
    );
}

export function githubApiError(operation: string, ghError: unknown): ApiError {
    const status = extractStatus(ghError);
    const message = extractMessage(ghError);

    // Map GitHub status codes to specific errors
    if (status === 401) return badCredentials(message);
    if (status === 403 && message?.includes("rate limit")) return rateLimited();
    if (status === 404) return notFound("Resource", operation);

    return new ApiError(
        status >= 400 ? status : 502,
        ErrorCode.GITHUB_API_ERROR,
        `GitHub API error during: ${operation}`,
        message,
        "This may be a temporary GitHub issue. Try again in a moment.",
    );
}

// ── Error Handler Middleware ────────────────────────────────────────────────────

export function errorResponse(c: Context, error: unknown) {
    if (error instanceof ApiError) {
        return c.json(
            {
                error: error.message,
                code: error.code,
                ...(error.details && { details: error.details }),
                ...(error.hint && { hint: error.hint }),
            },
            error.statusCode as 400,
        );
    }

    // Unexpected errors
    const message = error instanceof Error ? error.message : String(error);
    console.error("[unhandled]", error);

    return c.json(
        {
            error: "An unexpected error occurred",
            code: ErrorCode.INTERNAL_ERROR,
            details: message,
        },
        500,
    );
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function extractStatus(error: unknown): number {
    if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        typeof (error as { status: unknown }).status === "number"
    ) {
        return (error as { status: number }).status;
    }
    return 500;
}

function extractMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof (error as { message: unknown }).message === "string"
    ) {
        return (error as { message: string }).message;
    }
    return String(error);
}
