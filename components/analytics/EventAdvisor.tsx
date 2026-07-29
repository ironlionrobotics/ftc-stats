"use client";

import { useEffect, useMemo, useState } from "react";
import { EventProfile, projectAtEvent, strategyNote, Verdict } from "@/lib/event-selector";
import { Compass, Info } from "lucide-react";
import clsx from "clsx";

/**
 * Event advisor — compares historical event fields ("¿dónde me conviene
 * competir?") against the user's projected OPR. Data: static profiles
 * generated from the global backtest (scripts/oracle-backtest.mjs
 * export-profiles), lazy-loaded so the analytics route bundle stays lean.
 * Estimates are directional and labeled as such (decisions.md #57-#58).
 * (Not to be confused with EventSelector.tsx, the Data Lab event picker.)
 */
export default function EventAdvisor() {
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
        return <p className="text-muted-foreground text-sm animate-pulse py-8 text-center">Cargando perfiles históricos…</p>;
    }
    if (profiles.length === 0) {
        return <p className="text-muted-foreground text-sm py-8 text-center">Sin dataset de perfiles (regenera con <code className="font-mono">scripts/oracle-backtest.mjs export-profiles</code>).</p>;
    }

    return (
        <div className="space-y-5">
            {/* Controls */}
            <div className="bg-card border border-border rounded-2xl p-4 md:p-5 flex flex-wrap items-end gap-4">
                <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tu OPR proyectado</span>
                    <input
                        type="number"
                        min={0}
                        placeholder="ej. 80"
                        value={myOPR}
                        onChange={e => setMyOPR(e.target.value)}
                        className="block mt-1 w-28 px-3 py-2 bg-muted border border-border rounded-lg font-mono text-sm text-foreground"
                    />
                </label>
                <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tipo</span>
                    <select value={type} onChange={e => setType(e.target.value)} className="block mt-1 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground">
                        <option value="all">Todos</option>
                        {types.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Región</span>
                    <select value={region} onChange={e => setRegion(e.target.value)} className="block mt-1 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground">
                        <option value="all">Todas</option>
                        {regions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </label>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 ml-auto max-w-xs leading-snug">
                    <Info size={13} className="shrink-0" />
                    Estimaciones direccionales sobre el field histórico de cada evento — no garantías.
                </p>
            </div>

            {/* Comparison table */}
            <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full min-w-[760px] text-sm">
                    <thead>
                        <tr className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-widest">
                            <th className="p-3 text-left font-bold">Evento</th>
                            <th className="p-3 text-center font-bold">Equipos</th>
                            <th className="p-3 text-center font-bold">OPR medio / top</th>
                            <th className="p-3 text-center font-bold">Volatilidad (σ)</th>
                            {hasOPR && <th className="p-3 text-center font-bold">Tu seed est.</th>}
                            {hasOPR && <th className="p-3 text-center font-bold">Veredicto</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {rows.map(({ p, proj }) => (
                            <tr key={`${p.season}-${p.code}`} className="hover:bg-muted/40 transition-colors" title={proj ? strategyNote(proj) : undefined}>
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
                Regla σ (validada en el backtest global, decisiones #57-#58): field <b>ordenado</b> (σ≤40) favorece a favoritos; field <b>caótico</b> (σ≥60) da vida a los retadores. Pasa el cursor sobre una fila para la nota estratégica.
            </p>
        </div>
    );
}

function VolatilityChip({ sigma }: { sigma: number }) {
    const cls = sigma <= 40
        ? "bg-success/10 text-success border-success/20"
        : sigma >= 60
            ? "bg-danger/10 text-danger border-danger/20"
            : "bg-warning/10 text-warning border-warning/20";
    const label = sigma <= 40 ? "Ordenado" : sigma >= 60 ? "Caótico" : "Medio";
    return (
        <span className={clsx("inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap", cls)}>
            {label} · {sigma.toFixed(0)}
        </span>
    );
}

function VerdictChip({ v }: { v: Verdict }) {
    const map: Record<Verdict, [string, string]> = {
        capitan: ["Capitán probable", "bg-primary/10 text-primary border-primary/20"],
        pick: ["Pick probable", "bg-secondary/10 text-secondary border-secondary/20"],
        burbuja: ["Burbuja", "bg-warning/10 text-warning border-warning/20"],
        fuera: ["Fuera de playoffs", "bg-muted text-muted-foreground border-border"],
    };
    const [label, cls] = map[v];
    return <span className={clsx("inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap", cls)}>{label}</span>;
}
