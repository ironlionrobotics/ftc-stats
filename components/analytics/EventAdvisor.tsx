"use client";

import { useEffect, useMemo, useState } from "react";
import { EventProfile, projectAtEvent, strategyNote, Verdict } from "@/lib/event-selector";
import { Compass, Info } from "lucide-react";
import clsx from "clsx";
import { useTranslations } from "next-intl";

/**
 * Event advisor — compares historical event fields ("¿dónde me conviene
 * competir?") against the user's projected OPR. Data: static profiles
 * generated from the global backtest (scripts/oracle-backtest.mjs
 * export-profiles), lazy-loaded so the analytics route bundle stays lean.
 * Estimates are directional and labeled as such (decisions.md #57-#58).
 * (Not to be confused with EventSelector.tsx, the Data Lab event picker.)
 */
export default function EventAdvisor() {
    const tSelector = useTranslations("EventSelector");
    const t = useTranslations("EventAdvisor");
    const [profiles, setProfiles] = useState<EventProfile[] | null>(null);
    const [myOPR, setMyOPR] = useState<string>("");
    const [region, setRegion] = useState<string>("all");
    const [type, setType] = useState<string>("Premier");

    useEffect(() => {
        let alive = true;
        import("@/lib/data/event-profiles.json")
            .then(m => { if (alive) setProfiles(m.default as EventProfile[]); })
            .catch(() => { if (alive) setProfiles([]); });
        return () => { alive = false; };
    }, []);

    const regions = useMemo(() => {
        const set = new Set((profiles ?? []).map(p => p.region).filter((r): r is string => !!r));
        return [...set].sort();
    }, [profiles]);

    const types = useMemo(() => {
        const set = new Set((profiles ?? []).map(p => p.type));
        return [...set].sort();
    }, [profiles]);

    const opr = Number(myOPR);
    const hasOPR = Number.isFinite(opr) && myOPR.trim() !== "" && opr > 0;

    const rows = useMemo(() => {
        if (!profiles) return [];
        const verdictRank: Record<Verdict, number> = { capitan: 0, pick: 1, burbuja: 2, fuera: 3 };
        return profiles
            .filter(p => (region === "all" || p.region === region) && (type === "all" || p.type === type))
            .map(p => ({ p, proj: hasOPR ? projectAtEvent(opr, p) : null }))
            .sort((a, b) => {
                if (a.proj && b.proj) {
                    const v = verdictRank[a.proj.verdict] - verdictRank[b.proj.verdict];
                    if (v !== 0) return v;
                    return b.proj.percentile - a.proj.percentile;
                }
                return b.p.season - a.p.season || a.p.oprMean - b.p.oprMean;
            })
            .slice(0, 60);
    }, [profiles, region, type, hasOPR, opr]);

    if (profiles === null) {
        return <p className="text-muted-foreground text-sm animate-pulse py-8 text-center">{t("loadingProfiles")}</p>;
    }
    if (profiles.length === 0) {
        return <p className="text-muted-foreground text-sm py-8 text-center">{t.rich("noDataset", { code: (chunks) => <code className="font-mono">{chunks}</code> })}</p>;
    }

    return (
        <div className="space-y-5">
            {/* Controls */}
            <div className="bg-card border border-border rounded-2xl p-4 md:p-5 flex flex-wrap items-end gap-4">
                <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("myOpr")}</span>
                    <input
                        type="number"
                        min={0}
                        placeholder={t("oprPlaceholder")}
                        value={myOPR}
                        onChange={e => setMyOPR(e.target.value)}
                        className="block mt-1 w-28 px-3 py-2 bg-muted border border-border rounded-lg font-mono text-sm text-foreground"
                    />
                </label>
                <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("type")}</span>
                    <select value={type} onChange={e => setType(e.target.value)} className="block mt-1 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground">
                        <option value="all">{t("all")}</option>
                        {types.map(ty => <option key={ty} value={ty}>{ty}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("region")}</span>
                    <select value={region} onChange={e => setRegion(e.target.value)} className="block mt-1 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground">
                        <option value="all">{t("allRegions")}</option>
                        {regions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </label>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 ml-auto max-w-xs leading-snug">
                    <Info size={13} className="shrink-0" />
                    {t("disclaimer")}
                </p>
            </div>

            {/* Comparison table */}
            <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full min-w-[760px] text-sm">
                    <thead>
                        <tr className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-widest">
                            <th className="p-3 text-left font-bold">{t("colEvent")}</th>
                            <th className="p-3 text-center font-bold">{t("colTeams")}</th>
                            <th className="p-3 text-center font-bold">{t("colOpr")}</th>
                            <th className="p-3 text-center font-bold">{t("colVolatility")}</th>
                            {hasOPR && <th className="p-3 text-center font-bold">{t("colSeed")}</th>}
                            {hasOPR && <th className="p-3 text-center font-bold">{t("colVerdict")}</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {rows.map(({ p, proj }) => (
                            <tr key={`${p.season}-${p.code}`} className="hover:bg-muted/40 transition-colors" title={proj ? tSelector(`strategy.${strategyNote(proj)}`) : undefined}>
                                <td className="p-3">
                                    <div className="font-bold text-foreground leading-tight">{p.name}</div>
                                    <div className="text-[10px] text-muted-foreground font-mono">{p.code} · {p.season} · {p.region ?? "—"}</div>
                                </td>
                                <td className="p-3 text-center font-mono text-muted-foreground">{p.teams}</td>
                                <td className="p-3 text-center font-mono text-secondary">{p.oprMean.toFixed(0)} / {p.oprTop.toFixed(0)}</td>
                                <td className="p-3 text-center">
                                    <VolatilityChip sigma={p.sigma} />
                                </td>
                                {proj && (
                                    <td className="p-3 text-center font-mono text-foreground">
                                        #{proj.expectedSeed}<span className="text-muted-foreground text-xs">/{p.teams}</span>
                                        <div className="text-[10px] text-muted-foreground">p{proj.percentile.toFixed(0)}</div>
                                    </td>
                                )}
                                {proj && (
                                    <td className="p-3 text-center"><VerdictChip v={proj.verdict} /></td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Compass size={13} />
                {t.rich("sigmaRule", { b: (chunks) => <b>{chunks}</b> })}
            </p>
        </div>
    );
}

function VolatilityChip({ sigma }: { sigma: number }) {
    const tSelector = useTranslations("EventSelector");
    const cls = sigma <= 40
        ? "bg-success/10 text-success border-success/20"
        : sigma >= 60
            ? "bg-danger/10 text-danger border-danger/20"
            : "bg-warning/10 text-warning border-warning/20";
    // Volatility class comes straight from lib/event-selector.ts's own threshold
    // (the σ<=40/>=60 split), so the label is keyed off the same enum it returns.
    const volatilityKey = sigma <= 40 ? "ordenado" : sigma >= 60 ? "caotico" : "medio";
    return (
        <span className={clsx("inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap", cls)}>
            {tSelector(`volatility.${volatilityKey}`)} · {sigma.toFixed(0)}
        </span>
    );
}

function VerdictChip({ v }: { v: Verdict }) {
    const tSelector = useTranslations("EventSelector");
    const cls: Record<Verdict, string> = {
        capitan: "bg-primary/10 text-primary border-primary/20",
        pick: "bg-secondary/10 text-secondary border-secondary/20",
        burbuja: "bg-warning/10 text-warning border-warning/20",
        fuera: "bg-muted text-muted-foreground border-border",
    };
    return (
        <span className={clsx("inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap", cls[v])}>
            {tSelector(`verdictChip.${v}`)}
        </span>
    );
}
