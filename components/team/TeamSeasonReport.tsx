import { Fragment } from "react";
import { TEAM_30311_DECODE } from "@/lib/reports/team-30311-decode";
import { RookieComparison } from "@/components/team/RookieComparison";
import { ConsistencyTracker } from "@/components/team/ConsistencyTracker";
import {
    Trophy, TrendingUp, Award, Target, Globe, Medal,
    Flame, ArrowUpRight, Sparkles, MapPin, Rocket, ExternalLink, Activity,
} from "lucide-react";
import clsx from "clsx";

const R = TEAM_30311_DECODE;

/**
 * Sponsor-grade season retrospective for FTC #30311, DECODE 2025-26.
 * Server component, static curated data (lib/reports/team-30311-decode.ts),
 * flat semantic tokens only → respects the theme toggle and prints cleanly.
 */
export function TeamSeasonReport() {
    const bestEvent = R.events.reduce((a, b) => (b.totOpr > a.totOpr ? b : a));

    return (
        <section className="space-y-10 md:space-y-14">
            {/* ── Report banner ─────────────────────────────────────────── */}
            <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10" aria-hidden />
                <div className="relative px-6 md:px-10 py-8 md:py-10">
                    <div className="flex flex-wrap items-center gap-2 mb-5">
                        <Badge tone="primary" icon={<Rocket size={13} />}>Temporada rookie</Badge>
                        <Badge tone="muted">{R.meta.seasonLabel}</Badge>
                        <Badge tone="muted" icon={<MapPin size={13} />}>{R.meta.location}</Badge>
                    </div>

                    <h2 className="font-display text-3xl md:text-5xl font-black tracking-tight text-foreground max-w-3xl text-balance">
                        Un rookie con rendimiento de tier veterano
                    </h2>
                    <p className="mt-4 text-muted-foreground max-w-2xl leading-relaxed md:text-lg">
                        En su <strong className="text-foreground">primer año de competencia</strong>, Iron Lion terminó
                        entre el <strong className="text-foreground">top ~19% de los {R.meta.activeTeamsWorld.toLocaleString("es-MX")} equipos activos</strong> del
                        mundo, ganó el máximo honor de un evento FTC y llegó a playoffs del evento continental de México.
                    </p>

                    <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
                        <HeroStat value="Top 19%" label="Mundial · OPR total" sub={`#${R.skills[0].worldRank.toLocaleString("es-MX")} de ${R.meta.activeTeamsWorld.toLocaleString("es-MX")}`} icon={<Globe size={16} />} />
                        <HeroStat value="1°" label="Inspire Award" sub="Máximo honor · torneo debut" icon={<Trophy size={16} />} accent />
                        <HeroStat value="4" label="Eventos jugados" sub="Qualifier → Premier" icon={<Flame size={16} />} />
                        <HeroStat value="80.8" label="Mejor OPR" sub={`${bestEvent.code} · su evento cumbre`} icon={<ArrowUpRight size={16} />} />
                    </div>
                </div>
            </div>

            {/* ── Growth arc ───────────────────────────────────────────── */}
            <ReportSection
                n="01"
                title="El arco de crecimiento"
                desc="OPR total (potencia ofensiva estimada) evento por evento. La temporada termina en su punto más alto — y en su evento más importante."
                icon={<TrendingUp size={20} />}
            >
                <GrowthChart />
            </ReportSection>

            {/* ── Consistency tracker ──────────────────────────────────── */}
            <ReportSection
                n="02"
                title="Consistencia: ¿crecimiento o volatilidad?"
                desc="Un promedio de temporada esconde dos historias muy distintas. Aquí se separan: cuánta de la dispersión evento a evento es una tendencia de mejora, y cuánta es ruido — porque cada una se corrige de forma opuesta."
                icon={<Activity size={20} />}
            >
                <ConsistencyTracker />
            </ReportSection>

            {/* ── Skill breakdown ──────────────────────────────────────── */}
            <ReportSection
                n="03"
                title="Desglose de habilidad vs. el mundo"
                desc="Percentil mundial de la temporada por fase de juego. Fuertes en teleoperado y endgame; el autónomo es la palanca de crecimiento."
                icon={<Target size={20} />}
            >
                <div className="grid gap-4 md:gap-5">
                    {R.skills.map((s) => (
                        <SkillBar key={s.key} skill={s} />
                    ))}
                </div>
            </ReportSection>

            {/* ── Results per event ────────────────────────────────────── */}
            <ReportSection
                n="04"
                title="Resultados por evento"
                desc="Cada parada de la temporada: field, ranking, récord, RP, OPR y reconocimientos."
                icon={<Medal size={20} />}
            >
                <div className="overflow-x-auto rounded-2xl border border-border">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead>
                            <tr className="bg-muted/50 text-muted-foreground">
                                <Th className="text-left">Evento</Th>
                                <Th>Tipo</Th>
                                <Th>Rank</Th>
                                <Th>Récord</Th>
                                <Th>RP</Th>
                                <Th>OPR</Th>
                                <Th className="text-left">Reconocimientos</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {R.events.map((e) => (
                                <tr key={e.code} className="border-t border-border align-top">
                                    <td className="px-4 py-4">
                                        <div className="font-bold text-foreground leading-tight">{e.name}</div>
                                        <div className="text-xs text-muted-foreground mt-0.5 font-mono">{e.code} · {e.dates}</div>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <EventTypePill type={e.type} />
                                    </td>
                                    <td className="px-4 py-4 text-center whitespace-nowrap">
                                        <span className="font-display font-black text-foreground text-lg">#{e.rank}</span>
                                        <span className="text-muted-foreground text-xs">/{e.fieldSize}</span>
                                    </td>
                                    <td className="px-4 py-4 text-center font-mono text-foreground whitespace-nowrap">{e.record}</td>
                                    <td className="px-4 py-4 text-center font-mono text-muted-foreground">{e.rp.toFixed(2)}</td>
                                    <td className="px-4 py-4 text-center font-mono font-bold text-secondary">{e.totOpr.toFixed(1)}</td>
                                    <td className="px-4 py-4">
                                        <div className="flex flex-col gap-1">
                                            {e.awards.length === 0
                                                ? <span className="text-xs text-muted-foreground/60 italic">—</span>
                                                : e.awards.map((a) => (
                                                    <span key={a} className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                                        <Award size={12} className="text-warning shrink-0" /> {a}
                                                    </span>
                                                ))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </ReportSection>

            {/* ── Mexico cohort ────────────────────────────────────────── */}
            <ReportSection
                n="05"
                title="Frente a los grandes de México"
                desc="Los 8 programas mexicanos más consolidados (3 a 9 temporadas) por OPR — la vara del tier veterano. No es la tabla de posiciones nacional: Iron Lion es rookie (1ª temporada) y aparece al final para medir la distancia a ese tier, no como un 9° lugar."
                icon={<MapPin size={20} />}
            >
                <CohortTable rows={[...R.mexicoCohort]} showSeasons dividerLabel="tier veterano ↑ · nuestro debut ↓" />
                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                    <p>
                        <strong className="text-foreground">Cómo leerla:</strong> arriba, programas con años de historia (columna Temporadas); abajo, nuestro debut. Es un mapa de crecimiento, no un ranking. Entre <strong className="text-foreground">rookies</strong> mexicanos, Iron Lion es <strong className="text-foreground">#5 de 31</strong> — y #1 por premios (ver sección siguiente).
                    </p>
                    <p>
                        Referencia de élite: <strong className="text-foreground">Devolt Phobos (12887)</strong>, rank mundial 224 tras 9 temporadas — a dónde puede crecer el programa.
                    </p>
                </div>
            </ReportSection>

            {/* ── Rookie comparison · national + international ──────────── */}
            <ReportSection
                n="06"
                title="Contra otros rookies"
                desc="Cómo se ubica Iron Lion entre los equipos rookie (debut 2025) a nivel nacional e internacional — por desempeño del robot (OPR) y por premios. Ambas cohortes son exhaustivas contra el registro de FTCScout."
                icon={<Sparkles size={20} />}
            >
                <RookieComparison />
            </ReportSection>

            {/* ── World context ────────────────────────────────────────── */}
            <ReportSection
                n="07"
                title="El horizonte mundial"
                desc="El top 5 del planeta esta temporada — programas consolidados con años de historia. Marca la ambición, no la vara de hoy."
                icon={<Globe size={20} />}
            >
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {R.worldTop5.map((t, i) => (
                        <div key={t.number} className="rounded-2xl border border-border bg-card p-4 flex items-center gap-4">
                            <div className="font-display font-black text-2xl text-muted-foreground/50 w-8 shrink-0">{i + 1}</div>
                            <div className="min-w-0">
                                <div className="font-bold text-foreground truncate">{t.name}</div>
                                <div className="text-xs text-muted-foreground font-mono">#{t.number} · {t.country}</div>
                            </div>
                            <div className="ml-auto text-right shrink-0">
                                <div className="font-mono font-bold text-secondary">{t.totOpr.toFixed(0)}</div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">OPR</div>
                            </div>
                        </div>
                    ))}
                    <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4 flex items-center gap-3">
                        <Rocket size={20} className="text-primary shrink-0" />
                        <p className="text-sm text-muted-foreground leading-snug">
                            Iron Lion está a <strong className="text-foreground">~24% del #1 del mundo</strong> — la referencia de un programa élite de varios años.
                        </p>
                    </div>
                </div>
            </ReportSection>

            {/* ── Learnings ────────────────────────────────────────────── */}
            <ReportSection
                n="08"
                title="Aprendizajes y próximos objetivos"
                desc="Lo que la data dice sobre dónde crecer."
                icon={<Target size={20} />}
            >
                <div className="grid md:grid-cols-3 gap-4">
                    {R.learnings.map((l) => (
                        <div key={l.title} className="rounded-2xl border border-border bg-card p-6">
                            <h4 className="font-display font-bold text-foreground leading-tight">{l.title}</h4>
                            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{l.body}</p>
                        </div>
                    ))}
                </div>
            </ReportSection>

            {/* ── Sponsor takeaways ────────────────────────────────────── */}
            <div className="rounded-3xl border border-border bg-gradient-to-br from-primary/5 to-secondary/5 p-6 md:p-10">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 rounded-xl bg-primary/10 text-primary"><Sparkles size={20} /></div>
                    <div>
                        <h3 className="font-display text-2xl font-black text-foreground">Resumen para patrocinadores</h3>
                        <p className="text-sm text-muted-foreground">Titulares defendibles, cada uno respaldado por datos citados.</p>
                    </div>
                </div>
                <ul className="grid md:grid-cols-2 gap-4">
                    {R.takeaways.map((t, i) => (
                        <li key={i} className="flex gap-3">
                            <div className="mt-1 shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black font-mono">{i + 1}</div>
                            <span className="text-sm text-foreground/90 leading-relaxed">{t}</span>
                        </li>
                    ))}
                </ul>
            </div>

            {/* ── Sources ──────────────────────────────────────────────── */}
            <div className="text-xs text-muted-foreground border-t border-border pt-5">
                <span className="font-bold uppercase tracking-widest">Fuentes</span>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
                    {R.sources.map((s) => (
                        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-secondary hover:text-primary transition-colors">
                            {s.label} <ExternalLink size={11} />
                        </a>
                    ))}
                </div>
                <p className="mt-3 text-muted-foreground/70 italic">
                    Retrospectiva de temporada finalizada (datos fijos, verificados vía FTCScout GraphQL, jul 2026). El OPR (Offensive Power Rating) estima la contribución de puntos de un equipo a partir de resultados de alianza por mínimos cuadrados.
                </p>
            </div>
        </section>
    );
}

/* ─────────────────────────── viz + primitives ─────────────────────────── */

function GrowthChart() {
    const pts = R.events.map((e) => ({ code: e.code, v: e.totOpr, label: e.dates }));
    const W = 720, H = 260, padX = 44, padY = 34;
    const max = 90, min = 40; // frame the arc with headroom
    const x = (i: number) => padX + (i * (W - padX * 2)) / (pts.length - 1);
    const y = (v: number) => padY + (H - padY * 2) * (1 - (v - min) / (max - min));
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.v)}`).join(" ");
    const area = `${line} L${x(pts.length - 1)},${H - padY} L${x(0)},${H - padY} Z`;

    return (
        <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Arco de crecimiento del OPR total por evento">
                <defs>
                    <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
                    </linearGradient>
                </defs>
                {/* gridlines */}
                {[40, 50, 60, 70, 80, 90].map((g) => (
                    <g key={g}>
                        <line x1={padX} x2={W - padX} y1={y(g)} y2={y(g)} stroke="var(--color-border)" strokeWidth="1" />
                        <text x={padX - 10} y={y(g) + 4} textAnchor="end" className="fill-[var(--color-muted-foreground)]" fontSize="11" fontFamily="var(--font-mono)">{g}</text>
                    </g>
                ))}
                <path d={area} fill="url(#growthFill)" />
                <path d={line} fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                {pts.map((p, i) => (
                    <g key={p.code}>
                        <circle cx={x(i)} cy={y(p.v)} r="6" fill="var(--color-card)" stroke="var(--color-primary)" strokeWidth="3" />
                        <text x={x(i)} y={y(p.v) - 16} textAnchor="middle" className="fill-[var(--color-foreground)]" fontSize="15" fontWeight="800" fontFamily="var(--font-display)">{p.v.toFixed(1)}</text>
                        <text x={x(i)} y={H - padY + 20} textAnchor="middle" className="fill-[var(--color-muted-foreground)]" fontSize="12" fontWeight="700" fontFamily="var(--font-mono)">{p.code}</text>
                    </g>
                ))}
            </svg>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>Guadalajara · dic 2025</span>
                <span className="text-primary font-semibold flex items-center gap-1"><ArrowUpRight size={13} /> +59% en la temporada</span>
                <span>FPEMX · jul 2026</span>
            </div>
        </div>
    );
}

function SkillBar({ skill }: { skill: (typeof R.skills)[number] }) {
    const strong = skill.percentile >= 85;
    return (
        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                    <span className="font-bold text-foreground">{skill.label}</span>
                    {strong && <span className="text-[10px] font-black uppercase tracking-wider text-success bg-success/10 px-2 py-0.5 rounded-full">Fortaleza</span>}
                    {skill.key === "auto" && <span className="text-[10px] font-black uppercase tracking-wider text-warning bg-warning/10 px-2 py-0.5 rounded-full">A mejorar</span>}
                </div>
                <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-foreground">{skill.value.toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground ml-2">#{skill.worldRank.toLocaleString("es-MX")}</span>
                </div>
            </div>
            <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                    className={clsx("absolute inset-y-0 left-0 rounded-full", strong ? "bg-success" : skill.key === "auto" ? "bg-warning" : "bg-secondary")}
                    style={{ width: `${skill.percentile}%` }}
                />
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground font-mono">Top {(100 - skill.percentile).toFixed(0)}% mundial</div>
        </div>
    );
}

function CohortTable({ rows, showSeasons, dividerLabel }: { rows: Array<{ number: number; name: string; location?: string; seasons?: number; totOpr: number; worldRank: number; self?: boolean }>; showSeasons?: boolean; dividerLabel?: string }) {
    const cols = showSeasons ? 4 : 3;
    return (
        <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[480px] text-sm">
                <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                        <Th className="text-left">Equipo</Th>
                        {showSeasons && <Th>Temporadas</Th>}
                        <Th>OPR</Th>
                        <Th>Rank mundial</Th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((t, i) => {
                        // A separator before the highlighted "self" row makes clear it is a
                        // reference point below the group above, not the next ranked entry.
                        const dividerBefore = t.self && i > 0 && !rows[i - 1].self;
                        return (
                            <Fragment key={t.number}>
                                {dividerBefore && (
                                    <tr>
                                        <td colSpan={cols} className="px-4 py-1.5 text-center bg-muted/20 text-muted-foreground/70 font-mono text-[11px] uppercase tracking-wider">
                                            {dividerLabel ?? "···"}
                                        </td>
                                    </tr>
                                )}
                                <tr className={clsx("border-t border-border", t.self && "bg-primary/5")}>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className={clsx("font-bold leading-tight", t.self ? "text-primary" : "text-foreground")}>{t.name}</span>
                                            {t.self && <span className="text-[10px] font-black uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">Nosotros · rookie</span>}
                                        </div>
                                        <div className="text-xs text-muted-foreground font-mono">#{t.number}{t.location ? ` · ${t.location}` : ""}</div>
                                    </td>
                                    {showSeasons && (
                                        <td className="px-4 py-3 text-center font-mono text-muted-foreground">
                                            {t.seasons}{t.seasons === 1 ? " (rookie)" : ""}
                                        </td>
                                    )}
                                    <td className={clsx("px-4 py-3 text-center font-mono font-bold", t.self ? "text-primary" : "text-secondary")}>{t.totOpr.toFixed(1)}</td>
                                    <td className="px-4 py-3 text-center font-mono text-muted-foreground">#{t.worldRank.toLocaleString("es-MX")}</td>
                                </tr>
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function ReportSection({ n, title, desc, icon, children }: { n: string; title: string; desc: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="space-y-5">
            <div className="flex items-start gap-4">
                <div className="shrink-0 mt-1 p-2.5 rounded-xl bg-muted text-primary">{icon}</div>
                <div>
                    <div className="flex items-center gap-2.5">
                        <span className="font-mono text-sm text-primary font-semibold">{n}</span>
                        <h3 className="font-display text-xl md:text-2xl font-black text-foreground tracking-tight">{title}</h3>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground max-w-3xl leading-relaxed">{desc}</p>
                </div>
            </div>
            {children}
        </div>
    );
}

function HeroStat({ value, label, sub, icon, accent }: { value: string; label: string; sub: string; icon: React.ReactNode; accent?: boolean }) {
    return (
        <div className={clsx("rounded-2xl border p-4", accent ? "border-primary/30 bg-primary/5" : "border-border bg-card/60 backdrop-blur-sm")}>
            <div className={clsx("flex items-center gap-1.5 text-xs font-semibold", accent ? "text-primary" : "text-muted-foreground")}>{icon}{label}</div>
            <div className="mt-1.5 font-display text-2xl md:text-3xl font-black text-foreground leading-none">{value}</div>
            <div className="mt-1.5 text-[11px] text-muted-foreground leading-tight">{sub}</div>
        </div>
    );
}

function Badge({ children, tone, icon }: { children: React.ReactNode; tone: "primary" | "muted"; icon?: React.ReactNode }) {
    return (
        <span className={clsx(
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold",
            tone === "primary" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border border-border",
        )}>
            {icon}{children}
        </span>
    );
}

function EventTypePill({ type }: { type: string }) {
    const map: Record<string, string> = {
        Qualifier: "bg-muted text-muted-foreground border-border",
        Championship: "bg-secondary/10 text-secondary border-secondary/20",
        Premier: "bg-primary/10 text-primary border-primary/20",
    };
    const label: Record<string, string> = { Qualifier: "Regional", Championship: "Championship", Premier: "Premier" };
    return <span className={clsx("inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap", map[type])}>{label[type] ?? type}</span>;
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
    return <th className={clsx("px-4 py-3 text-center text-[11px] font-bold uppercase tracking-widest", className)}>{children}</th>;
}
