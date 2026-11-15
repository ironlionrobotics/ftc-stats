import { Suspense } from "react";
import { cookies } from "next/headers";
import ProScoutingDashboard from "@/components/scouting/ProScoutingDashboard";
import { getCurrentSeason } from "@/lib/constants";
import { Info } from "lucide-react";

// Rendered on-demand. We don't pre-generate static params because the global
// Sidebar uses useSearchParams which can't be statically prerendered, and the
// underlying dashboard data is dynamic anyway.
export const dynamic = "force-dynamic";

export default async function ProScoutingPage({
    params,
}: {
    params: Promise<{ eventCode: string }>;
}) {
    const { eventCode } = await params;
    const cookieStore = await cookies();
    const season = Number(cookieStore.get("ftc_season")?.value) || getCurrentSeason();

    return (
        <div className="container mx-auto px-4 py-8 max-w-7xl">
            {/* Header / Context */}
            <div className="mb-8">
                <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 bg-brand/15 text-brand-ink rounded text-xs font-black uppercase tracking-wider border border-brand-ink/30">
                        BETA FEATURE
                    </span>
                    <span className="px-2 py-0.5 bg-muted text-foreground rounded text-xs font-black uppercase tracking-wider border border-border">
                        IRON LION INTELLIGENCE
                    </span>
                </div>
                <h1 className="text-3xl md:text-4xl font-black text-foreground mb-2">
                    Pro-Scouting Database
                </h1>
                <p className="text-muted-foreground max-w-3xl leading-relaxed">
                    Métricas agregadas de la temporada. Esta herramienta analiza
                    <span className="font-bold text-foreground"> todos los partidos históricos </span>
                    de cada equipo en la temporada 2025 para calcular consistencia y techos de rendimiento.
                </p>

                <div className="mt-4 p-3 bg-warning-tint border border-warning/30 rounded-lg flex gap-3 text-warning text-xs items-start max-w-2xl">
                    <Info className="flex-shrink-0 mt-0.5" size={16} />
                    <p>
                        <strong>Nota de Rendimiento:</strong> La carga inicial puede tardar unos segundos mientras el servidor
                        procesa el historial completo de la temporada de todos los equipos. Los datos se almacenan en caché
                        automáticamente para visitas futuras.
                    </p>
                </div>
            </div>

            <Suspense fallback={<div className="text-muted-foreground">Cargando dashboard…</div>}>
                <ProScoutingDashboard eventCode={eventCode} season={season} />
            </Suspense>
        </div>
    );
}
