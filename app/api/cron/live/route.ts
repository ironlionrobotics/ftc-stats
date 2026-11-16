import { timingSafeEqual } from "node:crypto";
import { runLiveNotify } from "@/lib/notify/run";
import { flagOn } from "@/lib/app-config";

/**
 * Notification tick (decision #110). Cloud Scheduler POSTs here every minute
 * with the X-Cron-Secret header. Anything else gets 404 — the route doesn't
 * advertise itself.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
    const secret = process.env.CRON_SECRET;
    const got = req.headers.get("x-cron-secret");
    if (!secret || !got) return false;
    const a = Buffer.from(secret), b = Buffer.from(got);
    return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<Response> {
    if (!authorized(req)) return new Response("Not found", { status: 404 });
    // Superadmin pause (#119): the tick still answers so Cloud Scheduler sees no error.
    if (!(await flagOn("liveNotifications"))) return Response.json({ paused: true });
    try {
        const summary = await runLiveNotify(Date.now() + 45_000);
        if (summary.notices) console.log("[cron/live]", JSON.stringify(summary));
        return Response.json(summary);
    } catch (e) {
        console.error("[cron/live] tick failed:", e);
        return Response.json({ error: "tick failed" }, { status: 500 });
    }
}

/** Same answer as an unauthorized POST: the route doesn't reveal itself. */
export async function GET(): Promise<Response> {
    return new Response("Not found", { status: 404 });
}
