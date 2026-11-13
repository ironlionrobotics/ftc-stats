"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Last-resort boundary: the root layout itself failed, so there are no
 * providers (no i18n, no theme). Minimal bilingual markup with inline styles.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);
    return (
        <html lang="en">
            <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#07080a", color: "#f3f4f6" }}>
                <main style={{ maxWidth: 560, margin: "0 auto", padding: "64px 16px" }}>
                    <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>Something went wrong · Algo salió mal</h1>
                    <p style={{ color: "#8b92a1", margin: "0 0 20px" }}>
                        PRIDE couldn&apos;t load. Try again in a moment. · PRIDE no pudo cargar. Intenta de nuevo en un momento.
                    </p>
                    {error.digest && <p style={{ color: "#8b92a1", fontFamily: "monospace", fontSize: 12 }}>ref: {error.digest}</p>}
                    <button onClick={() => reset()} style={{ background: "#f3f4f6", color: "#07080a", border: 0, borderRadius: 4, padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>
                        Retry · Reintentar
                    </button>
                </main>
            </body>
        </html>
    );
}
