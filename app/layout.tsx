import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/shell/AppShell";
import { cookies } from "next/headers";
import { FOLLOW_TEAM_COOKIE, parseFollowedTeam } from "@/lib/follow-team";
import { FOLLOWS_COOKIE, parseFollows } from "@/lib/follows";
import { AuthProvider } from "@/context/AuthContext";
import { getAppConfig, getEffectiveFlags } from "@/lib/app-config";
import { bannerText } from "@/lib/app-config-schema";
import ThemeSync from "@/components/ThemeSync";
import QueryProvider from "@/components/QueryProvider";
// OnboardingModal + OnlineSync, deferred so the Firebase client SDK they pull
// in stays off the first-paint critical path. See the module for the rationale.
import DeferredGlobals from "@/components/DeferredGlobals";
import ThemedToaster from "@/components/ThemedToaster";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { PWAInstallCapture } from "@/components/PWAInstallPrompt";
import { activeEventForShell } from "@/lib/active-event-server";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

// Typography: system font stacks only (decision #93) — see app/globals.css.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AppMeta");
  return {
  title: t("title"),
  description: t("description"),
  manifest: "/manifest.webmanifest",
  applicationName: "PRIDE",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PRIDE",
    startupImage: [
      // iOS uses these as splash screens (one per device class). We don't
      // generate per-device-resolution startup images yet — pwa-asset-generator
      // can do it post-Premier. The 512 icon serves as a reasonable fallback.
      "/icons/icon-512.png",
    ],
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" },
      { url: "/icons/icon-167.png", sizes: "167x167", type: "image/png" },
      { url: "/icons/icon-152.png", sizes: "152x152", type: "image/png" },
    ],
    other: [
      { url: "/icons/icon-maskable-192.png", rel: "mask-icon", color: "#0a0a0a" },
    ],
  },
  formatDetection: {
    telephone: false,
  },
  };
}

import type { Viewport } from "next";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0e0c" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Apply the theme class before first paint (no flash). Reads the persisted
// Zustand theme ("ftc-theme" in localStorage): "light", "dark" or "system"
// (the default, #116), which follows prefers-color-scheme. Runs synchronously
// in <head>, ahead of the hydration in lib/stores/theme-store.ts.
const themeInitScript = `(function(){var d=document.documentElement;try{var s=localStorage.getItem('ftc-theme');var t=s?JSON.parse(s).state.theme:'system';var os=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t!=='light'&&os)){d.classList.add('dark');}}catch(e){if(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches){d.classList.add('dark');}}})();`;

// Theme and program state moved from Context to Zustand stores
// (lib/stores/theme-store.ts, lib/stores/program-store.ts). The root layout
// stays a Server Component — only Auth needs a Provider because it depends
// on the Firebase Auth SDK's user state.
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Runtime config (superadmin console, server-cached; degrades to defaults),
  // active locale (cookie/Accept-Language) and the app-wide active event for
  // the shell chip (#116; capped at 1.5 s, never throws) — in parallel.
  const [appConfig, flags, locale, { active: activeEvent, options: eventOptions }] = await Promise.all([
    getAppConfig(),
    getEffectiveFlags(),
    getLocale(),
    activeEventForShell(),
  ]);
  // Team the visitor follows without an account (pride_team cookie).
  const cookieStore = await cookies();
  const followedTeam = parseFollowedTeam(cookieStore.get(FOLLOW_TEAM_COOKIE)?.value);
  // Followed events/teams (decision #110), merged with the account's list on sign-in.
  const follows = parseFollows(cookieStore.get(FOLLOWS_COOKIE)?.value);
  // Site-wide notice from the superadmin console (#119); plain text, React-escaped.
  const banner = bannerText(appConfig.features.maintenanceBanner, locale);
  return (
    // suppressHydrationWarning: the themeInitScript below sets the `dark` class
    // on <html> before hydration, which intentionally differs from the server
    // markup. Scoped to this element only (standard next-themes pattern).
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className="antialiased bg-background text-foreground"
      >
        <ThemeSync />
        <NextIntlClientProvider>
          <QueryProvider>
            <AuthProvider>
              <ConfirmProvider>
                <AppShell followedTeam={followedTeam} follows={follows} activeEvent={activeEvent} eventOptions={eventOptions} aiAssistant={appConfig.features.aiAssistant} frc={flags.frc.value} robotHealth={flags.robotHealth.value} />
                <main id="main" tabIndex={-1} className="md:ml-56 min-h-screen pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0 outline-none">
                  {banner && (
                    <div role="status" className="border-b border-primary/30 bg-primary/10 px-4 py-2 text-center text-sm font-semibold text-foreground">
                      {banner}
                    </div>
                  )}
                  {children}
                </main>
                <DeferredGlobals aiAssistant={appConfig.features.aiAssistant} />
                <PWAInstallCapture />
                <ThemedToaster />
              </ConfirmProvider>
            </AuthProvider>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
