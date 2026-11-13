import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withSerwistInit from "@serwist/next";
import withBundleAnalyzerInit from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";

// Security headers (plan "PRIDE abierta al público" §4.4, decision #97).
// Enforced: transport, sniffing, framing, referrer and device permissions.
// CSP ships REPORT-ONLY first: violations surface in the browser console
// without breaking Firebase Auth popups, Sentry or the service worker; it is
// switched to enforcing once a few days of real traffic show no violations.
const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://firebasestorage.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
  "frame-src https://*.firebaseapp.com https://accounts.google.com https://www.youtube-nocookie.com",
  // Trading Card clips are played from blob: URLs read through the Storage SDK (#106).
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera stays available to this origin for the QR scanner (components/scouting/QRScanner.tsx).
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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

// next-intl (cookie-based locale, no URL routing). The plugin injects the
// request config alias (i18n/request.ts). Applied to the base config first so
// Serwist/analyzer/Sentry wrap the intl-aware config.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
const nextConfigWithIntl = withNextIntl(nextConfig);

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

const withPwa = withSerwist(nextConfigWithIntl);

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
