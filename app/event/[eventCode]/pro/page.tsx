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
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-black uppercase tracking-wider border border-blue-200">
                        BETA FEATURE
                    </span>
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-black uppercase tracking-wider border border-purple-200">
                        IRON LION INTELLIGENCE
                    </span>
                </div>
                <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-2">
                    Pro-Scouting Database
                </h1>
                <p className="text-slate-500 max-w-3xl leading-relaxed">
                    Acceso exclusivo a métricas agregadas de temporada. Esta herramienta analiza
                    <span className="font-bold text-slate-700"> todos los partidos históricos </span>
                    de cada equipo en la temporada 2025 para calcular consistencia y techos de rendimiento.
                </p>

                <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg flex gap-3 text-amber-800 text-xs items-start max-w-2xl">
                    <Info className="flex-shrink-0 mt-0.5" size={16} />
                    <p>
                        <strong>Nota de Rendimiento:</strong> La carga inicial puede tardar unos segundos mientras el servidor
                        procesa el historial completo de la temporada de todos los equipos. Los datos se almacenan en caché
                        automáticamente para visitas futuras.
                    </p>
                </div>
            </div>

            <Suspense fallback={<div className="text-slate-400">Cargando dashboard…</div>}>
                <ProScoutingDashboard eventCode={eventCode} season={season} />
            </Suspense>
        </div>
    );
}
