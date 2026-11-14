import "server-only";
import { createHash } from "node:crypto";

/**
 * Opaque per-event scout id stored on scout_claims (#103): hash of uid +
 * season + event, so a scout recognizes its own claims without exposing who
 * it is. Shared by the claim actions and the notification cron (#110), which
 * matches a device's uid against the claims to remind "your robot plays soon".
 */
export function scoutHash(uid: string, season: number, eventCode: string): string {
    return createHash("sha256").update(`${uid}:${season}:${eventCode}`).digest("base64url").slice(0, 16);
}
