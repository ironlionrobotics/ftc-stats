/** Storage layout of robot logs (#120); mirrors storage.rules `robot_logs/…`. */

export const MAX_LOG_BYTES = 5 * 1024 * 1024;

export function logFolder(season: number, teamNumber: number, logId: string): string {
    return `robot_logs/${season}/${teamNumber}/${logId}`;
}

/**
 * File name accepted by the rules (`^[a-z0-9_]{1,48}\.csv$`): lowercased,
 * anything else → `_`, base trimmed to 48 chars, always ending in `.csv`.
 */
export function storageFileName(original: string): string {
    const base = original.split(/[\\/]/).pop()!.replace(/\.csv$/i, "").toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
    return `${base || "log"}.csv`;
}
