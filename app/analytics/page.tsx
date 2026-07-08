import { fetchEvents } from "@/lib/ftc-api";
import { getCurrentSeason } from "@/lib/constants";
import AnalyticsDashboard from "@/components/analytics/AnalyticsDashboard";
import CalibrationDashboard from "@/components/analytics/CalibrationDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { cookies } from "next/headers";
import { FlaskConical, Target } from "lucide-react";

// `cookies()` already opts this page into dynamic rendering; no need for force-dynamic.
// Revalidate cached fetches after 5 minutes to balance freshness with API load.
export const revalidate = 300;

export default async function AnalyticsPage() {
    const cookieStore = await cookies();
    // Use getCurrentSeason() as fallback (calendar-aware) instead of hardcoded
    // 2024. Keeping the cookie override so explicit season switches persist.
    const cookieSeason = Number(cookieStore.get("ftc_season")?.value);
    const season = cookieSeason || getCurrentSeason();

    const events = await fetchEvents(season);
    const sortedEvents = events
        .filter(e => e.code.startsWith("MX"))
        .sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime());

    return (
        <div className="container mx-auto px-4 py-8">
            <header className="mb-8">
                <h1 className="text-4xl font-bold font-display text-foreground mb-2">
                    Analytics
                    <span className="text-primary text-xl align-middle border border-primary/30 bg-primary/10 rounded-lg px-2 py-0.5 ml-2">
                        BETA
                    </span>
                </h1>
                <p className="text-muted-foreground">
                    Comparación multi-evento y métricas de calibración del modelo.
                </p>
            </header>

            <Tabs defaultValue="data-lab" className="space-y-6">
                <TabsList className="bg-white/5 border-white/10">
                    <TabsTrigger value="data-lab" className="flex items-center gap-2">
                        <FlaskConical size={16} /> Data Lab
                    </TabsTrigger>
                    <TabsTrigger value="calibration" className="flex items-center gap-2">
                        <Target size={16} /> Calibración
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="data-lab" className="m-0">
                    <AnalyticsDashboard initialEvents={sortedEvents} season={season} />
                </TabsContent>

                <TabsContent value="calibration" className="m-0">
                    <CalibrationDashboard />
                </TabsContent>
            </Tabs>
        </div>
    );
}
