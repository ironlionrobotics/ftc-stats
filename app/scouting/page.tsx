import { getAggregatedStats } from "@/lib/aggregation";
import { getCurrentSeason } from "@/lib/constants";
import ScoutingClient from "@/components/scouting/ScoutingClient";
import { cookies } from "next/headers";
import { AggregatedTeamStats } from "@/types/scouting";

export default async function ScoutingPage() {
    const cookieStore = await cookies();
    const season = Number(cookieStore.get("ftc_season")?.value) || getCurrentSeason();
    const program = cookieStore.get("active_program")?.value || "FTC";

    let initialTeams: AggregatedTeamStats[] = [];

    if (program === "FTC") {
        const { teamStats } = await getAggregatedStats(season);
        initialTeams = teamStats;
    } else {
        // Fake FRC Teams for now, until we fully link TBA rankings aggregation.
        initialTeams = [
            {
                teamNumber: 4400,
                teamName: "Cerbotics",
                regionalsAttended: 1,
                events: [{ eventCode: 'MXFRC', rank: 1, rs: 0, matchPoints: 0 }],
                totalRS: 0, averageRS: 0, totalMatchPoints: 0, averageMatchPoints: 0,
                totalBasePoints: 0, averageBasePoints: 0, totalAutoPoints: 0, averageAutoPoints: 0,
                totalNP: 0, averageNP: 0, opr: 45.2, totalHighScore: 0, averageHighScore: 0,
                totalWins: 0, totalLosses: 0, totalTies: 0, bestRank: 1, averageRank: 1,
                hasAdvanced: false, advancementPoints: { total: 0, judging: 0, playoff: 0, selection: 0, qualification: 0 }
            },
            {
                teamNumber: 3478,
                teamName: "PrepaTec LamBot",
                regionalsAttended: 1,
                events: [{ eventCode: 'MXFRC', rank: 2, rs: 0, matchPoints: 0 }],
                totalRS: 0, averageRS: 0, totalMatchPoints: 0, averageMatchPoints: 0,
                totalBasePoints: 0, averageBasePoints: 0, totalAutoPoints: 0, averageAutoPoints: 0,
                totalNP: 0, averageNP: 0, opr: 52.4, totalHighScore: 0, averageHighScore: 0,
                totalWins: 0, totalLosses: 0, totalTies: 0, bestRank: 2, averageRank: 2,
                hasAdvanced: false, advancementPoints: { total: 0, judging: 0, playoff: 0, selection: 0, qualification: 0 }
            },
            {
                teamNumber: 4635,
                teamName: "Botbusters",
                regionalsAttended: 1,
                events: [{ eventCode: 'MXFRC', rank: 3, rs: 0, matchPoints: 0 }],
                totalRS: 0, averageRS: 0, totalMatchPoints: 0, averageMatchPoints: 0,
                totalBasePoints: 0, averageBasePoints: 0, totalAutoPoints: 0, averageAutoPoints: 0,
                totalNP: 0, averageNP: 0, opr: 60.1, totalHighScore: 0, averageHighScore: 0,
                totalWins: 0, totalLosses: 0, totalTies: 0, bestRank: 3, averageRank: 3,
                hasAdvanced: false, advancementPoints: { total: 0, judging: 0, playoff: 0, selection: 0, qualification: 0 }
            }
        ];
    }

    return (
        <ScoutingClient initialTeams={initialTeams} />
    );
}
