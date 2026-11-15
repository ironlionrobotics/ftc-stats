import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ftc-stats--ironlion-scouting.us-central1.hosted.app";

/** Public entry points. Event and team pages are reached by links/search. */
export default function sitemap(): MetadataRoute.Sitemap {
    return ["/", "/acerca", "/events", "/teams", "/oracle"].map(path => ({
        url: `${BASE}${path}`,
        changeFrequency: path === "/" ? "hourly" : "daily",
    }));
}
