"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { AggregatedTeamStats } from "@/types/scouting";
import AllianceSelector from "./AllianceSelector";
import MatchSimulator from "./MatchSimulator";
import MatchBriefingCard from "./MatchBriefingCard";
import LiveRankingProjection from "./LiveRankingProjection";
import EventPoolTable from "./EventPoolTable";
import { useRouter } from "next/navigation";
import { SCOUTING_EVENT_COOKIE } from "@/lib/scouting-event";

// PicklistEditor pulls all of @dnd-kit (~200KB raw). Most strategy-page
// visits don't immediately touch the picklist tab; defer loading until the
// tab is actually selected.
const PicklistEditor = dynamic(() => import("./PicklistEditor"), {
    ssr: false,
    loading: () => <PicklistLoading />,
});
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import Tip from "@/components/ui/Tip";
import { Users, Swords, ListOrdered, FileText, Trophy, Share2 } from "lucide-react";

function PicklistLoading() {
    const t = useTranslations("StrategyPage");
    return <div className="p-12 text-center text-muted-foreground text-sm">{t("loadingPicklist")}</div>;
}

interface StrategyClientProps {
    teams: AggregatedTeamStats[];
    season: number;
    /** Event chosen on /scouting (shared cookie); every tab works on it (#100). */
    eventCode: string | null;
    events: Array<{ code: string; name: string; dateStart: string }>;
}

export default function StrategyClient({ teams, season, eventCode, events }: StrategyClientProps) {
    const t = useTranslations("StrategyPage");
    const tEvent = useTranslations("ScoutingEvent");
    const router = useRouter();
    const ev = eventCode ?? undefined;
    const changeEvent = (code: string) => {
        document.cookie = `${SCOUTING_EVENT_COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 120}; samesite=lax`;
        router.push(`/strategy?event=${code}`);
    };
    const b = { b: (chunks: React.ReactNode) => <strong>{chunks}</strong> };
    return (
        <div className="container mx-auto px-4 py-6">
            <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-bold text-foreground font-display tracking-tight">{t("title")}</h1>
                    <p className="text-muted-foreground text-sm mt-1">{t("subtitle")}</p>
                </div>
                {events.length > 0 && (
                    <label className="block md:w-96">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tEvent("event")}</span>
                        <select value={eventCode ?? ""} onChange={e => changeEvent(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                            {events.map(e => <option key={e.code} value={e.code}>{e.dateStart.slice(0, 10)} · {e.name} ({e.code})</option>)}
                        </select>
                    </label>
                )}
            </header>

            <Tabs defaultValue="picklist" className="space-y-6">
                <TabsList className="bg-muted border-border">
                    <TabsTrigger value="picklist" className="flex items-center gap-2">
                        <ListOrdered size={16} /> {t("tabPicklist")}
                    </TabsTrigger>
                    <TabsTrigger value="selector" className="flex items-center gap-2">
                        <Users size={16} /> {t("tabOracle")}
                    </TabsTrigger>
                    <TabsTrigger value="simulator" className="flex items-center gap-2">
                        <Swords size={16} /> {t("tabSimulator")}
                    </TabsTrigger>
                    <TabsTrigger value="briefing" className="flex items-center gap-2">
                        <FileText size={16} /> {t("tabBriefing")}
                    </TabsTrigger>
                    <TabsTrigger value="ranking" className="flex items-center gap-2">
                        <Trophy size={16} /> {t("tabRanking")}
                    </TabsTrigger>
                    {eventCode && (
                        <TabsTrigger value="pool" className="flex items-center gap-2">
                            <Share2 size={16} /> {tEvent("tabPool")}
                        </TabsTrigger>
                    )}
                </TabsList>

                <TabsContent value="picklist" className="m-0 space-y-4">
                    <Tip id="picklist-intro-v1" title={t("tipPicklistTitle")}>
                        {t.rich("tipPicklistBody", b)}
                    </Tip>
                    <PicklistEditor teams={teams} eventCode={ev} />
                </TabsContent>

                <TabsContent value="selector" className="m-0">
                    <AllianceSelector teams={teams} eventCode={ev} />
                </TabsContent>

                <TabsContent value="simulator" className="m-0 space-y-4">
                    <Tip id="simulator-intro-v1" title={t("tipSimTitle")}>
                        {t("tipSimBody")}
                    </Tip>
                    <MatchSimulator teams={teams} eventCode={ev} />
                </TabsContent>

                <TabsContent value="briefing" className="m-0 space-y-4">
                    <Tip id="briefing-intro-v1" title={t("tipBriefingTitle")}>
                        {t.rich("tipBriefingBody", b)}
                    </Tip>
                    <MatchBriefingCard teams={teams} eventCode={ev} />
                </TabsContent>

                <TabsContent value="ranking" className="m-0 space-y-4">
                    <Tip id="ranking-intro-v1" title={t("tipRankingTitle")}>
                        {t("tipRankingBody")}
                    </Tip>
                    <LiveRankingProjection teams={teams} eventCode={ev} />
                </TabsContent>

                {eventCode && (
                    <TabsContent value="pool" className="m-0">
                        <EventPoolTable season={season} eventCode={eventCode} />
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}
