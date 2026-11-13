import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for smoke E2E tests against `npm run dev`.
 *
 * Scope (intentional v1 scope before Premier Event):
 *   - Public-facing pages render without errors
 *   - Tabs in /strategy and /analytics switch correctly
 *   - Critical workflows that DON'T need auth (the auth flow requires real
 *     Google login which can't be automated cleanly)
 *
 * What's NOT covered (deferred post-julio):
 *   - Authenticated flows (need Firebase emulator setup)
 *   - Match scouting save (needs auth + Firestore mock)
 *   - PWA install / service worker behavior
 */
export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: "list",
    use: {
        baseURL: "http://localhost:3000",
        trace: "on-first-retry",
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
    webServer: {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
