// ── Crash / shutdown diagnostics ──────────────────────────────────────────────

globalThis.addEventListener("unhandledrejection", (e) => {
    const mem = Math.round(Deno.memoryUsage().heapUsed / 1024 / 1024);
    console.error(`[CRASH] Unhandled rejection (heap: ${mem}MB):`, e.reason);
});

globalThis.addEventListener("error", (e) => {
    const mem = Math.round(Deno.memoryUsage().heapUsed / 1024 / 1024);
    console.error(`[CRASH] Uncaught error (heap: ${mem}MB):`, e.error ?? e.message);
});

const signals: Deno.Signal[] = ["SIGINT", "SIGTERM", "SIGSTOP", "SIGKILL"] as const;

for (const signal of signals) {
    try {
        Deno.addSignalListener(signal, () => {
            const mem = Math.round(Deno.memoryUsage().heapUsed / 1024 / 1024);
            console.warn(`[SHUTDOWN] Received ${signal} (heap: ${mem}MB) — isolate shutting down`);
        });
    } catch {
        // Signal listeners may not be supported on all platforms
    }
}
