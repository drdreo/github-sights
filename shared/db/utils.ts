// ── DB Utilities ────────────────────────────────────────────────────────────────
//
// Shared helpers for batch query operations.

export const BATCH_SIZE = 500;

/**
 * Build a multi-row VALUES clause with positional parameters.
 * Returns { text: '($1,$2,...),($3,$4,...)', params: [...flatValues] }
 */
export function buildMultiRowValues<T>(
    rows: T[],
    extractor: (row: T) => unknown[]
): { text: string; params: unknown[] } {
    const params: unknown[] = [];
    const tuples: string[] = [];
    let idx = 1;
    for (const row of rows) {
        const values = extractor(row);
        const placeholders = values.map(() => `$${idx++}`);
        tuples.push(`(${placeholders.join(",")})`);
        params.push(...values);
    }
    return { text: tuples.join(","), params };
}
