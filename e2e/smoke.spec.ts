import { test, expect } from "@playwright/test";

/**
 * Smoke E2E suite. Verifies the app shell loads and key navigations work
 * without auth. Each test runs against a fresh page so failures isolate
 * cleanly.
 *
 * These tests are intentionally light — the real validation is unit tests
 * (lib/**) plus manual smoke at events. Treat these as a "did the build
 * survive a deploy" canary, not a comprehensive coverage suite.
 */

test.describe("Smoke", () => {
    test("home page loads without console errors", async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", e => errors.push(e.message));
        page.on("console", msg => {
            if (msg.type() === "error") errors.push(msg.text());
        });
        await page.goto("/");
        // Sidebar branding renders → app shell is up
        await expect(page.locator("text=FTC Stats")).toBeVisible({ timeout: 15_000 });
        // Tolerate Firebase/network warnings in dev, but no uncaught errors.
        const realErrors = errors.filter(e =>
            !e.includes("favicon") &&
            !e.includes("Firebase") &&
            !e.includes("Service Worker") &&
            !e.toLowerCase().includes("warning"),
        );
        expect(realErrors).toEqual([]);
    });

    test("/strategy shows 5 tabs", async ({ page }) => {
        await page.goto("/strategy");
        await expect(page.getByRole("tab", { name: /picklist/i })).toBeVisible();
        await expect(page.getByRole("tab", { name: /alliance oracle/i })).toBeVisible();
        await expect(page.getByRole("tab", { name: /simulador/i })).toBeVisible();
        await expect(page.getByRole("tab", { name: /briefing/i })).toBeVisible();
        await expect(page.getByRole("tab", { name: /live ranking/i })).toBeVisible();
    });

    test("/strategy tab switching renders each panel", async ({ page }) => {
        await page.goto("/strategy");
        // Simulator tab
        await page.getByRole("tab", { name: /simulador/i }).click();
        await expect(page.locator("text=/selecciona|VS/i").first()).toBeVisible();
        // Briefing tab
        await page.getByRole("tab", { name: /briefing/i }).click();
        await expect(page.locator("text=/Match Briefing/i")).toBeVisible();
        // Live ranking tab
        await page.getByRole("tab", { name: /live ranking/i }).click();
        await expect(page.locator("text=/Proyección final/i")).toBeVisible();
    });

    test("/analytics shows Data Lab + Calibración tabs", async ({ page }) => {
        await page.goto("/analytics");
        await expect(page.getByRole("tab", { name: /data lab/i })).toBeVisible();
        await expect(page.getByRole("tab", { name: /calibración|calibracion/i })).toBeVisible();
    });

    test("/scouting renders the team list shell", async ({ page }) => {
        await page.goto("/scouting");
        // With no auth we expect the empty/login state, not a crash
        await expect(page.locator("body")).toBeVisible();
    });
});
