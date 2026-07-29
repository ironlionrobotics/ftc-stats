import { MX_GROWTH as G } from "@/lib/reports/growth-curves";
import { Info } from "lucide-react";

/**
 * Where a rookie program stands against the trajectory of its own region.
 *
 * Server component over curated static data. The chart plots the median band
 * of Mexican programs by season-since-rookie, with Iron Lion's actual rookie
 * standing marked — the point of the whole section being a single comparison:
 * where they are now versus where a typical program is at the same age.
 */
export function GrowthCurve() {
    const all = G.all;
    const W = 720, H = 320, padX = 52, padY = 34;

    const maxYear = all[all.length - 1].year;
    const x = (year: number) => padX + ((year - 1) / (maxYear - 1)) * (W - padX * 2);
    const y = (p: number) => padY + (H - padY * 2) * (1 - p / 100);

    const band = [
        ...all.map(d => `${d === all[0] ? "M" : "L"}${x(d.year)},${y(d.p75)}`),
        ...[...all].reverse().map(d => `L${x(d.year)},${y(d.p25)}`),
        "Z",
    ].join(" ");
    const medianPath = all.map((d, i) => `${i === 0 ? "M" : "L"}${x(d.year)},${y(d.median)}`).join(" ");
    const cohortPath = G.cohort.map((d, i) => `${i === 0 ? "M" : "L"}${x(d.year)},${y(d.median)}`).join(" ");

    // The season at which the typical program first reaches Iron Lion's
    // current standing — the comparison the section exists to make.
    const catchUp = all.find(d => d.median >= G.self.percentile);

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
                    aria-label={`Curva de crecimiento de los programas de México. La mediana pasa del percentil ${all[0].median} en su temporada rookie al ${all[all.length - 1].median} en la séptima. Iron Lion está en el percentil ${G.self.percentile} en su primera temporada.`}>
                    {[0, 25, 50, 75, 100].map(p => (
                        <g key={p}>
                            <line x1={padX} x2={W - padX} y1={y(p)} y2={y(p)} stroke="var(--color-border)" strokeWidth="1" />
                            <text x={padX - 10} y={y(p) + 4} textAnchor="end" fontSize="11"
                                fontFamily="var(--font-mono)" className="fill-[var(--color-muted-foreground)]">p{p}</text>
                        </g>
                    ))}

                    {/* Interquartile band: the middle half of programs */}
                    <path d={band} fill="var(--color-secondary)" fillOpacity="0.12" />
                    <path d={medianPath} fill="none" stroke="var(--color-secondary)" strokeWidth="3"
                        strokeLinecap="round" strokeLinejoin="round" />
                    <path d={cohortPath} fill="none" stroke="var(--color-muted-foreground)" strokeWidth="2"
                        strokeDasharray="6 5" strokeLinecap="round" opacity="0.75" />

                    {all.map(d => (
                        <g key={d.year}>
                            <circle cx={x(d.year)} cy={y(d.median)} r="4.5"
                                fill="var(--color-card)" stroke="var(--color-secondary)" strokeWidth="2.5" />
                            <text x={x(d.year)} y={H - padY + 20} textAnchor="middle" fontSize="12" fontWeight="700"
                                fontFamily="var(--font-mono)" className="fill-[var(--color-muted-foreground)]">T{d.year}</text>
                            <text x={x(d.year)} y={H - padY + 34} textAnchor="middle" fontSize="9"
                                fontFamily="var(--font-mono)" className="fill-[var(--color-muted-foreground)]" opacity="0.7">n={d.teams}</text>
                        </g>
                    ))}

                    {/* Iron Lion, season 1 */}
                    <line x1={x(1)} y1={y(G.self.percentile)} x2={W - padX} y2={y(G.self.percentile)}
                        stroke="var(--color-primary)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.8" />
                    <circle cx={x(G.self.year)} cy={y(G.self.percentile)} r="7"
                        fill="var(--color-primary)" stroke="var(--color-card)" strokeWidth="3" />
                    <text x={x(1) + 12} y={y(G.self.percentile) - 12} fontSize="12" fontWeight="800"
                        fontFamily="var(--font-display)" className="fill-[var(--color-primary)]">
                        Iron Lion · p{G.self.percentile}
                    </text>
                </svg>

                <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                    <Key color="var(--color-secondary)" label="Mediana de México" />
                    <Key color="var(--color-secondary)" label="Mitad central (p25-p75)" band />
                    <Key color="var(--color-muted-foreground)" label={`Cohorte fija (${G.cohortSize} programas de 5+ temporadas)`} dashed />
                    <Key color="var(--color-primary)" label="Iron Lion, temporada 1" dot />
                </div>
            </div>

            {catchUp && (
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
                    <p className="text-foreground leading-relaxed">
                        En su <strong>primera temporada</strong>, Iron Lion está en el{" "}
                        <strong className="text-primary">percentil {G.self.percentile}</strong> de México
                        ({G.self.rank}º de {G.self.of} equipos con datos). La mediana de un programa mexicano
                        en su temporada rookie es el percentil {G.all[0].median} — y no alcanza el nivel actual
                        de Iron Lion hasta su <strong className="text-primary">temporada {catchUp.year}</strong>.
                    </p>
                </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-border bg-card p-5">
                    <h4 className="font-bold text-foreground mb-2">El salto grande es el año 2</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        De temporada 1 a 2 la mediana sube{" "}
                        <strong className="text-foreground">
                            {(G.all[1].median - G.all[0].median).toFixed(1)} puntos de percentil
                        </strong>{" "}
                        ({G.all[0].median} → {G.all[1].median}), el mayor movimiento de toda la curva y el
                        mejor medido ({G.all[0].teams} y {G.all[1].teams} equipos). Después viene una meseta:
                        temporadas 3 a 5 se mueven poco.
                    </p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-5">
                    <h4 className="font-bold text-foreground mb-2">La cola engaña</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        El repunte de las temporadas 6-7 es en parte <strong className="text-foreground">supervivencia</strong>,
                        no mejora: se pasa de {G.all[0].teams} equipos a {G.all[G.all.length - 1].teams}. Los
                        programas que duran ya arrancaban{" "}
                        <strong className="text-foreground">
                            ~{(G.cohort[0].median - G.all[0].median).toFixed(0)} puntos
                        </strong>{" "}
                        por encima en su temporada 1. La línea punteada sigue sólo a los que duran.
                    </p>
                </div>
            </div>

            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 leading-snug">
                <Info size={12} className="shrink-0 mt-0.5" />
                Percentil dentro de México y dentro de cada temporada — el OPR crudo no es comparable entre juegos
                distintos, así que compararlo directamente inventaría una tendencia. {G.caveat} Datos: FTCScout,
                {" "}{G.teamsTotal} equipos mexicanos con año rookie conocido; regenerables con{" "}
                <code className="font-mono">scripts/growth-curves.mjs</code>.
            </p>
        </div>
    );
}

function Key({ color, label, band, dashed, dot }: {
    color: string; label: string; band?: boolean; dashed?: boolean; dot?: boolean;
}) {
    return (
        <span className="flex items-center gap-1.5">
            <span
                aria-hidden
                className={band ? "inline-block w-3.5 h-3.5 rounded" : dot ? "inline-block w-2.5 h-2.5 rounded-full" : "inline-block w-5 h-0.5 rounded-full"}
                style={band
                    ? { backgroundColor: color, opacity: 0.28 }
                    : dashed
                        ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 5px, transparent 5px 9px)` }
                        : { backgroundColor: color }}
            />
            {label}
        </span>
    );
}
