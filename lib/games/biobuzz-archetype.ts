import { inputsFromEntry } from "@/lib/games/score-inputs";

export type BiobuzzArchetype = "Tipper" | "Gardener" | "Florist" | "Balanced" | "Unknown";

/**
 * Classifies a team's BIOBUZZ play style from its raw match-scouting entries.
 * Tipper: averages >= 1 HIVE TIP per match, or CELL launches dominate.
 * Gardener: GARDEN elements dominate. Florist: FLOWER elements dominate.
 */
export function classifyBiobuzzArchetype(entries: object[]): BiobuzzArchetype {
    if (entries.length === 0) return "Unknown";
    let tips = 0;
    let cells = 0;
    let garden = 0;
    let flowers = 0;
    for (const entry of entries) {
        const i = inputsFromEntry(entry);
        tips += i.num("autoHiveTips") + i.num("teleopHiveTips");
        cells += i.num("autoCellLaunches") + i.num("teleopCellLaunches");
        garden += i.num("teleopGardenElements");
        flowers += i.num("flowerElementsPlaced");
    }
    const n = entries.length;
    tips /= n;
    cells /= n;
    garden /= n;
    flowers /= n;

    if (tips >= 1 || (cells > 0 && cells > garden && cells > flowers)) return "Tipper";
    if (garden > 0 && garden > flowers) return "Gardener";
    if (flowers > 0 && flowers > garden) return "Florist";
    return "Balanced";
}
