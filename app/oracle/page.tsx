import type { Metadata } from "next";
import { getTranslations, getFormatter } from "next-intl/server";
import { ORACLE_CALIBRATION as C } from "@/lib/reports/oracle-calibration";
import { Target, Activity, Layers, AlertTriangle, Repeat, ExternalLink } from "lucide-react";
import clsx from "clsx";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("OraclePage");
    const format = await getFormatter();
    return {
        title: t("metaTitle"),
        description: t("metaDescription", { matches: format.number(C.totals.matches), seasons: C.totals.seasons }),
    };
}

/**
 * Public transparency page for the Oracle's accuracy.
 *
 * Deliberately public and unauthenticated: a prediction tool that won't show
 * its error rate is asking for trust it hasn't earned. It also shows the
 * uncomfortable finding — the first playoff model was badly overconfident —
 * because a page that only showed the good result would be marketing.
 *
 * Server Component over curated static data (lib/reports/oracle-calibration.ts),
 * so it costs no client JS beyond the layout.
 */
export default async function OracleCalibrationPage() {
    const t = await getTranslations("OraclePage");
    const format = await getFormatter();
    const rich = { b: (chunks: React.ReactNode) => <strong className="text-foreground">{chunks}</strong> };
    // Looked up rather than indexed: the seasons array grows every year, and a
    // positional index would silently point at the wrong game.
    const powerPlay = C.seasons.find(s => s.season === 2022);
    const tr = (n: number) => format.number(n);

    return (
        <div className="container mx-auto px-4 md:px-8 py-8 md:py-14 max-w-5xl">
            {/* ── Hero ──────────────────────────────────────────────────── */}
            <header className="mb-12 md:mb-16">
                <div className="flex flex-wrap items-center gap-2 mb-5">
                    <Badge tone="primary">{t("badgeTransparency")}</Badge>
                    <Badge tone="muted">{t("badgeSeasons", { seasons: C.totals.seasons })}</Badge>
                </div>
                <h1 className="font-display text-4xl md:text-6xl font-black tracking-tight text-foreground text-balance">
                    {t("heroTitle")}
                </h1>
                <p className="mt-5 text-muted-foreground max-w-2xl leading-relaxed md:text-lg">
                    {t.rich("heroBody", rich)}
                </p>

                <div className="mt-9 grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Stat value={`${C.totals.accuracy}%`} label={t("statAccuracy")} sub={t("statAccuracySub")} accent />
                    <Stat value={tr(C.totals.matches)} label={t("statMatches")} sub={t("statMatchesSub")} />
                    <Stat value={tr(C.totals.events)} label={t("statEvents")} sub={t("statEventsSub")} />
                    <Stat value={`${C.totals.seasons}`} label={t("statSeasons")} sub={t("statSeasonsSub")} />
                </div>
            </header>

            {/* ── Reliability ───────────────────────────────────────────── */}
            <Section
                icon={<Activity size={19} />}
                title={t("relTitle")}
                lead={t("relLead", { matches: tr(C.reliability.matches) })}
            >
                <ReliabilityChart />

                <div className="mt-6 grid md:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-danger/30 bg-danger/5 p-5">
                        <h3 className="font-bold text-danger mb-2 flex items-center gap-2">
                            <AlertTriangle size={15} /> {t("badFirstTitle")}
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            {t.rich("badFirstBody", { ...rich, p98: C.reliability.raw[4].realized, p85: C.reliability.raw[3].realized })}
                        </p>
                    </div>
                    <div className="rounded-2xl border border-success/30 bg-success/5 p-5">
                        <h3 className="font-bold text-success mb-2 flex items-center gap-2">
                            <Target size={15} /> {t("fixTitle")}
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            {t.rich("fixBody", rich)}
                        </p>
                    </div>
                </div>

                <div className="mt-5 overflow-x-auto rounded-2xl border border-border">
                    <table className="w-full min-w-[620px] text-sm">
                        <thead>
                            <tr className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-widest">
                                <Th className="text-left">{t("colWhenModelSays")}</Th>
                                <Th>{t("colOriginal")}</Th>
                                <Th>{t("colCorrected")}</Th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {C.reliability.corrected.map((bin, i) => (
                                <tr key={bin.range}>
                                    <td className="px-4 py-3 font-bold text-foreground">{bin.range}</td>
                                    {/* Each model gets its OWN match count: correcting the
                                        uncertainty re-sorts predictions between bins, so a
                                        single shared count would imply the two percentages
                                        describe the same matches. They don't. */}
                                    <td className="px-4 py-3 text-center font-mono tabular-nums">
                                        <GapCell
                                            realized={C.reliability.raw[i].realized}
                                            gap={C.reliability.raw[i].gap}
                                            matchesText={t("matchesCount", { count: tr(C.reliability.raw[i].matches) })}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-center font-mono tabular-nums">
                                        <GapCell realized={bin.realized} gap={bin.gap} matchesText={t("matchesCount", { count: tr(bin.matches) })} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground max-w-3xl leading-snug">
                    {t("relNote", { from: tr(C.reliability.raw[4].matches), to: tr(C.reliability.corrected[4].matches) })}
                </p>
            </Section>

            {/* ── Per season ────────────────────────────────────────────── */}
            <Section
                icon={<Repeat size={19} />}
                title={t("seasonsTitle")}
                lead={t("seasonsLead")}
            >
                <div className="overflow-x-auto rounded-2xl border border-border">
                    <table className="w-full min-w-[660px] text-sm">
                        <thead>
                            <tr className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-widest">
                                <Th className="text-left">{t("colSeason")}</Th>
                                <Th>{t("colEvents")}</Th>
                                <Th>{t("colMatches")}</Th>
                                <Th>{t("colAccuracy")}</Th>
                                <Th>{t("colBrier")}</Th>
                                <Th>{t("colCalibration")}</Th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {C.seasons.map(s => (
                                <tr key={s.season} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-4 py-3">
                                        <span className="font-bold text-foreground">{s.game}</span>
                                        <span className="text-muted-foreground text-xs ml-2 font-mono">{s.season}-{String(s.season + 1).slice(2)}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center font-mono text-muted-foreground tabular-nums">{s.events}</td>
                                    <td className="px-4 py-3 text-center font-mono text-muted-foreground tabular-nums">{tr(s.matches)}</td>
                                    <td className="px-4 py-3 text-center font-mono font-bold text-primary tabular-nums">{s.accuracy}%</td>
                                    <td className="px-4 py-3 text-center font-mono text-secondary tabular-nums">{s.brier}</td>
                                    <td className="px-4 py-3 text-center font-mono tabular-nums text-muted-foreground">
                                        {s.gap > 0 ? "+" : ""}{s.gap} pp
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                    {t.rich("howToRead", { ...rich, em: (chunks) => <em>{chunks}</em> })}{powerPlay && t.rich("powerPlayNote", { ...rich, gap: powerPlay.gap })}
                </p>
            </Section>

            {/* ── By level ──────────────────────────────────────────────── */}
            <Section
                icon={<Layers size={19} />}
                title={t("levelTitle")}
                lead={t("levelLead")}
            >
                <div className="space-y-3">
                    {C.levels.map(l => (
                        <div key={l.key} className="rounded-2xl border border-border bg-card p-4 md:p-5">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                                <span className="font-bold text-foreground">{t.has(`level_${l.key}`) ? t(`level_${l.key}`) : l.label}</span>
                                <span className="text-xs text-muted-foreground font-mono">
                                    {t("matchesCount", { count: tr(l.matches) })}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="relative h-2.5 flex-1 rounded-full bg-muted overflow-hidden">
                                    <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${l.accuracy}%` }} />
                                </div>
                                <span className="font-mono font-bold text-primary tabular-nums w-14 text-right">{l.accuracy}%</span>
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

            {/* ── Limits ────────────────────────────────────────────────── */}
            <Section
                icon={<AlertTriangle size={19} />}
                title={t("limitsTitle")}
                lead={t("limitsLead")}
            >
                <ul className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                    <Limit title={t("limit1Title")}>
                        {t.rich("limit1Body", rich)}
                    </Limit>
                    <Limit title={t("limit2Title")}>
                        {t("limit2Body")}
                    </Limit>
                    <Limit title={t("limit3Title")}>
                        {t("limit3Body")}
                    </Limit>
                    <Limit title={t("limit4Title")}>
                        {t("limit4Body")}
                    </Limit>
                </ul>
            </Section>

            {/* ── Reproduce ─────────────────────────────────────────────── */}
            <section className="rounded-3xl border border-border bg-card p-6 md:p-8">
                <h2 className="font-display text-2xl font-black text-foreground mb-2">{t("verifyTitle")}</h2>
                <p className="text-sm text-muted-foreground mb-5 max-w-2xl leading-relaxed">
                    {t("verifyBody")}
                </p>
                <div className="rounded-xl bg-muted border border-border p-4 overflow-x-auto">
                    <pre className="text-xs font-mono text-foreground leading-relaxed whitespace-pre">
{C.reproduce.steps.join("\n")}
                    </pre>
                </div>
                <a
                    href={C.reproduce.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-secondary hover:underline"
                >
                    {t("dataSource")} <ExternalLink size={13} />
                </a>
            </section>

            <p className="mt-10 text-xs text-muted-foreground text-center">
                {t("footer")}
            </p>
        </div>
    );
}

/**
 * Reliability diagram: predicted probability (x) against what actually
 * happened (y). The diagonal is perfect calibration; a curve below it means
 * overconfidence. The raw model bows well under the line — that IS the
 * finding, so it stays on the chart rather than being quietly dropped.
 */
async function ReliabilityChart() {
    const t = await getTranslations("OraclePage");
    const W = 720, H = 420, pad = 56;
    const x = (p: number) => pad + ((p - 50) / 50) * (W - pad * 2);
    const y = (p: number) => H - pad - ((p - 50) / 50) * (H - pad * 2);
    const path = (bins: readonly { predicted: number; realized: number }[]) =>
        bins.map((b, i) => `${i === 0 ? "M" : "L"}${x(b.predicted)},${y(b.realized)}`).join(" ");

    const ticks = [50, 60, 70, 80, 90, 100];

    return (
        <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
                aria-label={t("chartAria", { p98: C.reliability.raw[4].realized })}>
                {ticks.map(t => (
                    <g key={t}>
                        <line x1={x(t)} x2={x(t)} y1={pad} y2={H - pad} stroke="var(--color-border)" strokeWidth="1" />
                        <line x1={pad} x2={W - pad} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth="1" />
                        <text x={x(t)} y={H - pad + 20} textAnchor="middle" fontSize="11"
                            fontFamily="var(--font-mono)" className="fill-[var(--color-muted-foreground)]">{t}%</text>
                        <text x={pad - 10} y={y(t) + 4} textAnchor="end" fontSize="11"
                            fontFamily="var(--font-mono)" className="fill-[var(--color-muted-foreground)]">{t}%</text>
                    </g>
                ))}

                {/* Perfect calibration */}
                <line x1={x(50)} y1={y(50)} x2={x(100)} y2={y(100)}
                    stroke="var(--color-muted-foreground)" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.6" />
                {/* Sits below the diagonal in the empty lower-right region, where
                    neither curve passes — above it would collide with the
                    corrected series, which tracks the diagonal closely. */}
                <text x={x(84)} y={y(62)} fontSize="11" fontWeight="700" fontFamily="var(--font-mono)"
                    className="fill-[var(--color-muted-foreground)]">{t("perfectCalibration")}</text>

                <path d={path(C.reliability.raw)} fill="none" stroke="var(--color-danger)" strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round" />
                {C.reliability.raw.map(b => (
                    <circle key={b.range} cx={x(b.predicted)} cy={y(b.realized)} r="5"
                        fill="var(--color-card)" stroke="var(--color-danger)" strokeWidth="3" />
                ))}

                <path d={path(C.reliability.corrected)} fill="none" stroke="var(--color-success)" strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round" />
                {C.reliability.corrected.map(b => (
                    <circle key={b.range} cx={x(b.predicted)} cy={y(b.realized)} r="5"
                        fill="var(--color-card)" stroke="var(--color-success)" strokeWidth="3" />
                ))}

                <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="12" fontWeight="700"
                    className="fill-[var(--color-muted-foreground)]">{t("axisSaid")}</text>
                <text x={16} y={H / 2} textAnchor="middle" fontSize="12" fontWeight="700"
                    transform={`rotate(-90 16 ${H / 2})`}
                    className="fill-[var(--color-muted-foreground)]">{t("axisHappened")}</text>
            </svg>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                <Key color="var(--color-danger)" label={t("keyOriginal")} />
                <Key color="var(--color-success)" label={t("keyCorrected")} />
            </div>
        </div>
    );
}

function Key({ color, label }: { color: string; label: string }) {
    return (
        <span className="flex items-center gap-2">
            <span aria-hidden className="inline-block w-5 h-0.5 rounded-full" style={{ backgroundColor: color }} />
            {label}
        </span>
    );
}

function GapCell({ realized, gap, matchesText }: { realized: number; gap: number; matchesText: string }) {
    const bad = Math.abs(gap) >= 5;
    return (
        <span className="inline-flex flex-col items-center leading-tight">
            <span className={clsx("font-bold", bad ? "text-danger" : "text-success")}>
                {realized}%
                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                    ({gap > 0 ? "+" : ""}{gap})
                </span>
            </span>
            <span className="text-[10px] font-normal text-muted-foreground mt-0.5">
                {matchesText}
            </span>
        </span>
    );
}

function Section({ icon, title, lead, children }: {
    icon: React.ReactNode; title: string; lead: string; children: React.ReactNode;
}) {
    return (
        <section className="mb-12 md:mb-16">
            <div className="flex items-start gap-3 mb-3">
                <span className="mt-0.5 shrink-0 w-9 h-9 rounded-xl bg-primary/10 border border-primary/25 text-primary grid place-items-center">
                    {icon}
                </span>
                <h2 className="font-display text-2xl md:text-3xl font-black text-foreground text-balance">{title}</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed mb-6 max-w-3xl">{lead}</p>
            {children}
        </section>
    );
}

function Limit({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <li className="rounded-2xl border border-border bg-card p-4 md:p-5">
            <span className="block font-bold text-foreground mb-1">{title}</span>
            {children}
        </li>
    );
}

function Stat({ value, label, sub, accent }: { value: string; label: string; sub: string; accent?: boolean }) {
    return (
        <div className={clsx("rounded-2xl border p-4", accent ? "border-primary/35 bg-primary/5" : "border-border bg-card")}>
            <div className={clsx("font-display font-black text-2xl md:text-3xl tabular-nums", accent ? "text-primary" : "text-foreground")}>
                {value}
            </div>
            <div className="text-xs font-bold text-foreground mt-1">{label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{sub}</div>
        </div>
    );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "primary" | "muted" }) {
    return (
        <span className={clsx(
            "text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border",
            tone === "primary"
                ? "bg-primary/10 border-primary/25 text-primary"
                : "bg-muted border-border text-muted-foreground",
        )}>
            {children}
        </span>
    );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
    return <th className={clsx("px-4 py-3 font-bold", className ?? "text-center")}>{children}</th>;
}
