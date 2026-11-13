import * as Sentry from "@sentry/nextjs";

// Client-side Sentry init. NEXT_PUBLIC_SENTRY_DSN must be set for client errors
// to be reported. We keep tracing sample rate low to limit bundle/runtime cost
// on the mobile devices scouts use, and intentionally do NOT enable Replay
// (~250KB) — pit/stand scouts often have constrained data plans.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        tracesSampleRate: 0.1,
        environment: process.env.NODE_ENV,
        enabled: process.env.NODE_ENV === "production",
    });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
