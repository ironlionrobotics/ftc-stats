import { redirect } from "next/navigation";
import { browsingSeason, resolveActiveEvent } from "@/lib/active-event-server";

/**
 * The "Evento" tab (decision #116): opens the app-wide active event; with no
 * event to open, the season's event list.
 */
export default async function ActiveEventPage() {
    const { season } = await browsingSeason();
    const { selected } = await resolveActiveEvent(season);
    redirect(selected ? `/event/${selected.code}` : "/events");
}
