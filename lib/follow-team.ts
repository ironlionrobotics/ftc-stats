import { isValidTeamNumber } from "@/lib/input-guards";

/** Cookie holding the team a visitor follows (set by setFollowedTeamAction). */
export const FOLLOW_TEAM_COOKIE = "pride_team";

/** Parses the cookie value; null when absent or not a valid team number. */
export function parseFollowedTeam(raw: string | undefined): number | null {
    if (!raw) return null;
    const n = Number(raw);
    return isValidTeamNumber(n) ? n : null;
}
