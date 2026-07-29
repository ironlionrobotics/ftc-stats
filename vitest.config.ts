import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Vitest config tailored for the algorithms in lib/. We don't load Next.js
// runtime here on purpose — server-only modules (firebase-admin, redis) are
// avoided in unit tests, so we don't need the next.js plugin or jsdom.
export default defineConfig({
    test: {
        include: ["lib/**/*.test.ts", "lib/**/__tests__/**/*.test.ts", "app/actions/**/*.test.ts"],
        environment: "node",
        // Speeds up CI and prevents accidental network calls slipping in.
        testTimeout: 5000,
    },
    resolve: {
        alias: {
            "@": resolve(__dirname, "."),
            // server-only is a Next.js build-time guard that throws on import
            // from client code. In unit tests we want to actually load these
            // modules, so alias it to an empty shim.
            "server-only": resolve(__dirname, "test/server-only-shim.ts"),
        },
    },
});
