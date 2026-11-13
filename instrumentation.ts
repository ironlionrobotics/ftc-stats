import * as Sentry from "@sentry/nextjs";

// Next.js calls this once per server runtime (nodejs / edge).
// Sentry SDK is loaded only if SENTRY_DSN is configured to avoid runtime cost
// in local dev or when telemetry is intentionally disabled.
export async function register() {
    if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;

    if (process.env.NEXT_RUNTIME === "nodejs") {
        Sentry.init({
            dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
            tracesSampleRate: 0.1,
            environment: process.env.NODE_ENV,
            // Only send errors in prod; in dev we want the local console.
            enabled: process.env.NODE_ENV === "production",
        });
    }

    if (process.env.NEXT_RUNTIME === "edge") {
        Sentry.init({
            dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
            tracesSampleRate: 0.1,
            environment: process.env.NODE_ENV,
            enabled: process.env.NODE_ENV === "production",
        });
    }
}

// Forwards React Server Component request errors to Sentry.
export const onRequestError = Sentry.captureRequestError;
