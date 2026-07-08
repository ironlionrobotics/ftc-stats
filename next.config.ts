import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withSerwistInit from "@serwist/next";
import withBundleAnalyzerInit from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '**',
      },
    ],
  },
};

// Serwist wraps the Next.js config to inject the service-worker build step.
// SW is disabled in development because hot-reload + cached SW makes for a
// confusing debug experience; the production build emits public/sw.js and
// the runtime registers it.
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: false, // we handle online events via React (components/OnlineSync.tsx)
});

const withPwa = withSerwist(nextConfig);

// Bundle analyzer: emit treemap reports under .next/analyze/ when
// ANALYZE=true is set. Use `ANALYZE=true npm run build` to inspect bundle
// composition before merging perf-sensitive changes.
const withBundleAnalyzer = withBundleAnalyzerInit({
  enabled: process.env.ANALYZE === "true",
});

const withAll = withBundleAnalyzer(withPwa);

// Wrap with Sentry only when SENTRY_ORG + SENTRY_PROJECT are configured
// (so local builds without Sentry credentials still work).
const shouldEnableSentry = !!(process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);

export default shouldEnableSentry
  ? withSentryConfig(withAll, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
      disableLogger: true,
    })
  : withAll;
