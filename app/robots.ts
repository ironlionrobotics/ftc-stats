import type { MetadataRoute } from "next";

/**
 * Crawlers may index the public pages; private/admin surfaces are excluded
 * (they're gated anyway, this just keeps them out of search results).
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/scouting", "/card"] },
    };
}
