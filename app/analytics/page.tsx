import { fetchEvents } from "@/lib/ftc-api";
import AnalyticsDashboard from "@/components/analytics/AnalyticsDashboard";
import { cookies } from "next/headers";

export default async function AnalyticsPage() {
    const cookieStore = await cookies();
    const season = Number(cookieStore.get("ftc_season")?.value || 2024);

    // Fetch all events for the season to populate the selector
    // Sorting by date is good practice
    const events = await fetchEvents(season);
    const sortedEvents = events
        .filter(e => e.code.startsWith("MX"))
        .sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime());

    return (
        <div className="container mx-auto px-4 py-8">
            <header className="mb-8">
                <h1 className="text-4xl font-bold font-display text-foreground mb-2">Data Lab <span className="text-primary text-xl align-middle border border-primary/30 bg-primary/10 rounded-lg px-2 py-0.5 ml-2">BETA</span></h1>
                <p className="text-muted-foreground">Motor de comparación analítica multi-evento.</p>
            </header>

            <AnalyticsDashboard initialEvents={sortedEvents} season={season} />
        </div>
    );
}
