"use client";

import { TEAM_30311_DECODE, RookieRow, RookieAward } from "@/lib/reports/team-30311-decode";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { MapPin, Globe, Trophy, Sparkles } from "lucide-react";
import clsx from "clsx";
import { useTranslations } from "next-intl";

const { national, international } = TEAM_30311_DECODE.rookies;

/**
 * Rookie-cohort comparison at two levels (national / international), through
 * two lenses: robot-game performance (OPR) and awards. Client component because
 * it uses the interactive Tabs primitive; fed entirely by the static report
 * module. 30311 is highlighted in every table.
 *
 * Award badges and country names come from lib/reports/team-30311-decode.ts as
 * translation key + params (never prose) — rendered here via next-intl
 * ("TeamReport" namespace, docs/architecture/i18n.md).
 */
export function RookieComparison() {
    const t = useTranslations("TeamReport");
    const tCountry = useTranslations("TeamReport.country");

    const topCountries = international.inspireCountries.top
        .map(c => `${tCountry(c.code)} ${c.count}`)
        .join(" · ");
    const otherCountries = international.inspireCountries.others.map(c => tCountry(c)).join(", ");

    return (
        <Tabs defaultValue="nacional">
            <TabsList>
                <TabsTrigger value="nacional">
                    <span className="flex items-center gap-1.5"><MapPin size={15} /> Nacional · México</span>
                </TabsTrigger>
                <TabsTrigger value="internacional">
                    <span className="flex items-center gap-1.5"><Globe size={15} /> Internacional</span>
                </TabsTrigger>
            </TabsList>

            {/* ── NATIONAL ─────────────────────────────────────────────── */}
            <TabsContent value="nacional">
                <div className="grid sm:grid-cols-2 gap-3 mb-5">
                    <Standing
                        lens="Juego (OPR)"
                        value={`#${national.oprRank}`}
                        of={`de ${national.total} rookies`}
                        note="Cuatro rookies mexicanos les superan en OPR"
                    />
                    <Standing
                        lens="Premios"
                        value={`#${national.awardsRank}`}
                        of={`de ${national.total} rookies`}
                        note={t("rookies.nationalHeadline")}
                        accent
                    />
                </div>

                <RookieTable rows={national.rows} placeHeader="Ciudad" />

                <AwardsCallout>
                    <b className="text-foreground">Iron Lion es el único rookie de México</b> en ganar un Inspire Award esta temporada
                    — y el único en formar parte de una alianza ganadora. De 31 programas rookie del país, ninguno de los otros 30
                    capturó el máximo honor de FTC. Por OPR son top-5; por reconocimiento del jurado, son <b className="text-foreground">#1</b>.
                </AwardsCallout>
            </TabsContent>

            {/* ── INTERNATIONAL ────────────────────────────────────────── */}
            <TabsContent value="internacional">
                <div className="grid sm:grid-cols-2 gap-3 mb-5">
                    <Standing
                        lens="Juego (OPR)"
                        value={`Top ${international.oprTopPct}%`}
                        of={`#${international.oprRank} de ${international.total.toLocaleString("es-MX")} rookies`}
                        note="Techo altísimo: Exodus (EE.UU.) es rookie y #6 del mundo"
                    />
                    <Standing
                        lens="Premios (Inspire)"
                        value={`Top ${international.inspireTopPct}%`}
                        of={`1 de ${international.inspireCohort} rookies con Inspire`}
                        note={`De ${international.inspireTotal.toLocaleString("es-MX")} rookies del mundo · único de México`}
                        accent
                    />
                </div>

                <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">Top 10 rookies del mundo por OPR</p>
                <RookieTable rows={international.rows} placeHeader="País" self={international.self} translatePlace />

                <AwardsCallout>
                    Por OPR bruto, 30311 está en el <b className="text-foreground">top ~14%</b> de los 1,317 rookies del mundo — sólido, aunque el tope
                    (equipos de EE.UU. y Kazajistán con 150-240 OPR) queda lejos. Pero por el <b className="text-foreground">Inspire Award</b> —el máximo honor de
                    FTC— pertenecen a un grupo de solo <b className="text-foreground">36 rookies en todo el planeta (2.7%)</b>, y son el único de México.
                    <span className="block mt-2 text-[11px] text-muted-foreground/80">
                        Origen de esos 36 Inspire rookie: {topCountries} · {t("inspireCountriesGlue")} {otherCountries}.
                    </span>
                </AwardsCallout>
            </TabsContent>
        </Tabs>
    );
}

/* ─────────────────────────── primitives ─────────────────────────── */

function Standing({ lens, value, of, note, accent }: { lens: string; value: string; of: string; note: string; accent?: boolean }) {
    return (
        <div className={clsx("rounded-2xl border p-5", accent ? "border-primary/40 bg-primary/5" : "border-border bg-card")}>
            <div className={clsx("flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider", accent ? "text-primary" : "text-muted-foreground")}>
                {accent ? <Trophy size={13} /> : <Sparkles size={13} />} {lens}
            </div>
            <div className={clsx("mt-1.5 font-display text-3xl font-black leading-none", accent ? "text-primary" : "text-foreground")}>{value}</div>
            <div className="mt-1 text-xs text-muted-foreground font-mono">{of}</div>
            <p className="mt-2.5 text-xs text-foreground/80 leading-snug">{note}</p>
        </div>
    );
}

function RookieTable({ rows, placeHeader, self, translatePlace }: { rows: RookieRow[]; placeHeader: string; self?: RookieRow; translatePlace?: boolean }) {
    return (
        <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
                <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest">Equipo</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest">{placeHeader}</th>
                        <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-widest">OPR</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest">Premios 25-26</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((t) => <RookieTr key={t.number} t={t} translatePlace={translatePlace} />)}
                    {self && (
                        <>
                            <tr><td colSpan={4} className="px-4 py-1.5 text-center text-muted-foreground/50 font-mono text-xs">···</td></tr>
                            <RookieTr t={self} translatePlace={translatePlace} />
                        </>
                    )}
                </tbody>
            </table>
        </div>
    );
}

function RookieTr({ t: row, translatePlace }: { t: RookieRow; translatePlace?: boolean }) {
    const t = useTranslations("TeamReport");
    const tCountry = useTranslations("TeamReport.country");
    // Every rookieAward variant carries a proper-noun `name` except
    // winningAlliance — isInspire drives the badge's warning tint below.
    const isInspire = (a: RookieAward) => "name" in a && a.name === "Inspire";
    return (
        <tr className={clsx("border-t border-border align-top", row.self && "bg-primary/5")}>
            <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className={clsx("font-bold leading-tight", row.self ? "text-primary" : "text-foreground")}>{row.name}</span>
                    {row.self && <span className="text-[10px] font-black uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">Nosotros</span>}
                </div>
                <span className="text-xs text-muted-foreground font-mono">#{row.number}</span>
            </td>
            <td className="px-4 py-3 text-muted-foreground">{translatePlace ? tCountry(row.place) : row.place}</td>
            <td className={clsx("px-4 py-3 text-center font-mono font-bold", row.self ? "text-primary" : "text-secondary")}>{row.totOpr.toFixed(1)}</td>
            <td className="px-4 py-3">
                {row.awards.length === 0
                    ? <span className="text-xs text-muted-foreground/50 italic">—</span>
                    : (
                        <div className="flex flex-wrap gap-1.5">
                            {row.awards.map((a, i) => {
                                const { key, ...params } = a;
                                return (
                                    <span
                                        key={`${key}-${i}`}
                                        className={clsx(
                                            "text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap",
                                            isInspire(a) ? "bg-warning/15 text-warning border border-warning/30" : "bg-muted text-muted-foreground border border-border",
                                        )}
                                    >
                                        {t(`rookieAward.${key}`, params)}
                                    </span>
                                );
                            })}
                        </div>
                    )}
            </td>
        </tr>
    );
}

function AwardsCallout({ children }: { children: React.ReactNode }) {
    return (
        <div className="mt-4 flex gap-3 rounded-2xl border border-border bg-muted/30 p-4">
            <Trophy size={18} className="text-warning shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
        </div>
    );
}
