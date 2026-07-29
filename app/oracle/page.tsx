import type { Metadata } from "next";
import { ORACLE_CALIBRATION as C } from "@/lib/reports/oracle-calibration";
import { Target, Activity, Layers, AlertTriangle, Repeat, ExternalLink } from "lucide-react";
import clsx from "clsx";

export const metadata: Metadata = {
    title: "Calibración del Oracle — PRIDE",
    description:
        `El modelo de predicción de PRIDE, validado contra ${C.totals.matches.toLocaleString("es-MX")} partidos de playoffs reales ` +
        `de ${C.totals.seasons} temporadas. Precisión, error y calibración publicados en abierto.`,
};

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
export default function OracleCalibrationPage() {
    // Looked up rather than indexed: the seasons array grows every year, and a
    // positional index would silently point at the wrong game.
    const powerPlay = C.seasons.find(s => s.season === 2022);

    return (
        <div className="container mx-auto px-4 md:px-8 py-8 md:py-14 max-w-5xl">
            {/* ── Hero ──────────────────────────────────────────────────── */}
            <header className="mb-12 md:mb-16">
                <div className="flex flex-wrap items-center gap-2 mb-5">
                    <Badge tone="primary">Transparencia</Badge>
                    <Badge tone="muted">{C.totals.seasons} temporadas · 2019-2025</Badge>
                </div>
                <h1 className="font-display text-4xl md:text-6xl font-black tracking-tight text-foreground text-balance">
                    Qué tan bien predice el Oracle
                </h1>
                <p className="mt-5 text-muted-foreground max-w-2xl leading-relaxed md:text-lg">
                    PRIDE predice ganadores de playoffs. Esta página publica qué tan seguido acierta —
                    y, más importante, si sus probabilidades <strong className="text-foreground">significan lo que dicen</strong>.
                    Todo se recalculó desde partidos reales; nada está redondeado a favor.
                </p>

                <div className="mt-9 grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Stat value={`${C.totals.accuracy}%`} label="Precisión global" sub="Ganador de playoff acertado" accent />
                    <Stat value={C.totals.matches.toLocaleString("es-MX")} label="Partidos evaluados" sub="Playoffs reales, no simulados" />
                    <Stat value={C.totals.events.toLocaleString("es-MX")} label="Eventos" sub="Todas las regiones disponibles" />
                    <Stat value={`${C.totals.seasons}`} label="Temporadas" sub="7 juegos distintos" />
                </div>
            </header>

            {/* ── Reliability ───────────────────────────────────────────── */}
            <Section
                icon={<Activity size={19} />}
                title="¿Un 80% significa 80%?"
                lead={`Precisión sola no basta. Si el modelo dice "80% de probabilidad", esos partidos deberían ganarse 8 de cada 10 veces — ni más, ni menos. Esto es lo que pasó en los ${C.reliability.matches.toLocaleString("es-MX")} partidos de playoffs de 2024 y 2025.`}
            >
                <ReliabilityChart />

                <div className="mt-6 grid md:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-danger/30 bg-danger/5 p-5">
                        <h3 className="font-bold text-danger mb-2 flex items-center gap-2">
                            <AlertTriangle size={15} /> La primera versión estaba mal
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            El modelo original estimaba su incertidumbre a partir de los partidos de clasificación.
                            En playoffs eso resultó <strong className="text-foreground">muy optimista</strong>: cuando decía
                            98% ganaba el {C.reliability.raw[4].realized}% de las veces, y cuando decía 85% ganaba
                            el {C.reliability.raw[3].realized}%. Se veía seguro de cosas que no lo eran.
                        </p>
                    </div>
                    <div className="rounded-2xl border border-success/30 bg-success/5 p-5">
                        <h3 className="font-bold text-success mb-2 flex items-center gap-2">
                            <Target size={15} /> La corrección se aprendió de los datos
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            En eliminación la incertidumbre real es <strong className="text-foreground">2.4× mayor</strong> que
                            en clasificación — un número ajustado sobre estos mismos partidos, no elegido a mano. Con esa
                            corrección cada tramo cae dentro de <strong className="text-foreground">3 puntos</strong> de
                            lo realizado.
                        </p>
                    </div>
                </div>

                <div className="mt-5 overflow-x-auto rounded-2xl border border-border">
                    <table className="w-full min-w-[620px] text-sm">
                        <thead>
                            <tr className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-widest">
                                <Th className="text-left">Cuando el modelo dice…</Th>
                                <Th>Modelo original</Th>
                                <Th>Modelo corregido</Th>
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
                                            matches={C.reliability.raw[i].matches}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-center font-mono tabular-nums">
                                        <GapCell realized={bin.realized} gap={bin.gap} matches={bin.matches} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground max-w-3xl leading-snug">
                    Cada columna trae su propio conteo de partidos porque los tramos no contienen lo mismo en ambos
                    modelos: corregir la incertidumbre mueve predicciones de los tramos altos hacia el centro — el
                    tramo 90-100% pasa de {C.reliability.raw[4].matches.toLocaleString("es-MX")} a{" "}
                    {C.reliability.corrected[4].matches.toLocaleString("es-MX")} partidos. Eso es justamente lo que
                    significa dejar de exagerar la certeza.
                </p>
            </Section>

            {/* ── Per season ────────────────────────────────────────────── */}
            <Section
                icon={<Repeat size={19} />}
                title="Siete temporadas, siete juegos distintos"
                lead="Cada temporada de FTC es un juego nuevo, con reglas y forma de anotar propias. El mismo modelo, sin reajustar por temporada, se mantiene en la misma banda — señal de que generaliza por diseño y no por casualidad."
            >
                <div className="overflow-x-auto rounded-2xl border border-border">
                    <table className="w-full min-w-[660px] text-sm">
                        <thead>
                            <tr className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-widest">
                                <Th className="text-left">Temporada</Th>
                                <Th>Eventos</Th>
                                <Th>Partidos</Th>
                                <Th>Precisión</Th>
                                <Th>Brier</Th>
                                <Th>Calibración</Th>
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
                                    <td className="px-4 py-3 text-center font-mono text-muted-foreground tabular-nums">{s.matches.toLocaleString("es-MX")}</td>
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
                    <strong className="text-foreground">Cómo leerla.</strong> <em>Brier</em> mide el error de la probabilidad
                    (0 es perfecto; 0.25 equivale a decir siempre 50/50). <em>Calibración</em> es la confianza declarada menos
                    la precisión lograda: negativo significa que el modelo fue algo más pesimista de lo necesario.
                    {" "}<strong className="text-foreground">Power Play (2022)</strong> es el punto bajo en precisión, y es
                    explicable: fue una temporada de meta defensivo, y la defensa no aparece en una métrica ofensiva.
                    Es justo el hueco que el scouting humano llena.{powerPlay && <>
                        {" "}Vale la pena notar que <strong className="text-foreground">esa misma temporada tuvo la
                        calibración más ajustada de las siete</strong> ({powerPlay.gap} pp): el modelo acertó menos,
                        pero no se sobrevendió. Perdió precisión, no honestidad.
                    </>}
                </p>
            </Section>

            {/* ── By level ──────────────────────────────────────────────── */}
            <Section
                icon={<Layers size={19} />}
                title="Entre más parejo el field, más difícil"
                lead="El mismo modelo pierde precisión conforme sube el nivel del evento. No es un defecto: en el Mundial todos los equipos son fuertes, así que la diferencia entre alianzas es menor y el resultado depende más de lo que ningún modelo ve."
            >
                <div className="space-y-3">
                    {C.levels.map(l => (
                        <div key={l.key} className="rounded-2xl border border-border bg-card p-4 md:p-5">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                                <span className="font-bold text-foreground">{l.label}</span>
                                <span className="text-xs text-muted-foreground font-mono">
                                    {l.matches.toLocaleString("es-MX")} partidos
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
                title="Lo que esto no dice"
                lead="Los límites importan tanto como los aciertos."
            >
                <ul className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                    <Limit title="No predice partidos individuales de clasificación">
                        Todo lo de esta página es sobre <strong className="text-foreground">playoffs</strong>, donde las
                        alianzas ya están formadas. Las clasificatorias tienen otra dinámica y no se evaluaron aquí.
                    </Limit>
                    <Limit title="Mide potencia ofensiva, no estrategia">
                        El modelo parte de cuánto anota cada equipo. Una alianza que gana por defensa, por un autónomo
                        que rompe empates o por coordinación humana se ve peor de lo que es. Power Play lo demuestra.
                    </Limit>
                    <Limit title="Un 76% deja 1 de cada 4 partidos del otro lado">
                        Es una herramienta para decidir mejor, no un oráculo. Cualquier equipo que la use para dejar de
                        scoutear está usándola al revés.
                    </Limit>
                    <Limit title="Datos públicos, con sus huecos">
                        Se usó la API pública de FTCScout. Eventos sin resultados publicados quedaron fuera del cálculo,
                        y no se incluyeron temporadas anteriores a 2019 porque no existen ahí.
                    </Limit>
                </ul>
            </Section>

            {/* ── Reproduce ─────────────────────────────────────────────── */}
            <section className="rounded-3xl border border-border bg-card p-6 md:p-8">
                <h2 className="font-display text-2xl font-black text-foreground mb-2">Compruébalo tú</h2>
                <p className="text-sm text-muted-foreground mb-5 max-w-2xl leading-relaxed">
                    Ninguna cifra de esta página se escribió a mano: todas salen de correr el backtest contra la API
                    pública y recalcular. Cualquiera puede repetirlo.
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
                    Fuente de datos: FTCScout <ExternalLink size={13} />
                </a>
            </section>

            <p className="mt-10 text-xs text-muted-foreground text-center">
                PRIDE · Iron Lion Robotics (FTC #30311) · Monterrey, México
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
function ReliabilityChart() {
    const W = 720, H = 420, pad = 56;
    const x = (p: number) => pad + ((p - 50) / 50) * (W - pad * 2);
    const y = (p: number) => H - pad - ((p - 50) / 50) * (H - pad * 2);
    const path = (bins: readonly { predicted: number; realized: number }[]) =>
        bins.map((b, i) => `${i === 0 ? "M" : "L"}${x(b.predicted)},${y(b.realized)}`).join(" ");

    const ticks = [50, 60, 70, 80, 90, 100];

    return (
        <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
                aria-label={`Diagrama de fiabilidad. El modelo original queda por debajo de la diagonal (sobreconfianza): cuando predice 98% gana ${C.reliability.raw[4].realized}%. El modelo corregido sigue la diagonal dentro de 3 puntos en todos los tramos.`}>
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
                    className="fill-[var(--color-muted-foreground)]">calibración perfecta</text>

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
                    className="fill-[var(--color-muted-foreground)]">Probabilidad que dijo el modelo</text>
                <text x={16} y={H / 2} textAnchor="middle" fontSize="12" fontWeight="700"
                    transform={`rotate(-90 16 ${H / 2})`}
                    className="fill-[var(--color-muted-foreground)]">Veces que ocurrió</text>
            </svg>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                <Key color="var(--color-danger)" label="Modelo original — sobreconfiado" />
                <Key color="var(--color-success)" label="Modelo corregido — en uso hoy" />
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

function GapCell({ realized, gap, matches }: { realized: number; gap: number; matches: number }) {
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
                {matches.toLocaleString("es-MX")} partidos
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
