/**
 * Display name of each FTC season's game, keyed by the API season year.
 * Single source for the season selector, the home header and the team page —
 * add the new game here at kickoff (see docs/architecture/game-schema-migration.md).
 */
const FTC_GAME_NAMES: Record<number, string> = {
    2026: "Biobuzz",
    2025: "Decode",
    2024: "Into The Deep",
    2023: "CenterStage",
    2022: "PowerPlay",
};

/** Game name for `season`, or undefined when we don't have one yet. */
export function seasonGameName(season: number): string | undefined {
    return FTC_GAME_NAMES[season];
}
