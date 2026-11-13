import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/shell/AppShell";
import { cookies } from "next/headers";
import { FOLLOW_TEAM_COOKIE, parseFollowedTeam } from "@/lib/follow-team";
import { AuthProvider } from "@/context/AuthContext";
import { getAppConfig } from "@/lib/app-config";
import ThemeSync from "@/components/ThemeSync";
import QueryProvider from "@/components/QueryProvider";
// OnboardingModal + OnlineSync, deferred so the Firebase client SDK they pull
// in stays off the first-paint critical path. See the module for the rationale.
import DeferredGlobals from "@/components/DeferredGlobals";
import { Toaster } from "sonner";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";

// Typography: system font stacks only (decision #93) — see app/globals.css.

export const metadata: Metadata = {
  title: "PRIDE — FTC Analytics por Iron Lion Robotics",
  description: "Estadísticas, scouting colaborativo y proyecciones para FIRST Tech Challenge México. Una app de Iron Lion Robotics (FTC #30311).",
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

import type { Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#07080a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Dark-first: apply the theme class before first paint so a
// dark-default app never flashes white. Reads the persisted Zustand theme
// ("ftc-theme" in localStorage); defaults to dark unless the user explicitly
// chose light. Runs synchronously in <head>, ahead of the React hydration
// that lib/stores/theme-store.ts performs.
const themeInitScript = `(function(){try{var s=localStorage.getItem('ftc-theme');var t=s?JSON.parse(s).state.theme:'dark';if(t!=='light'){document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`;

// Theme and program state moved from Context to Zustand stores
// (lib/stores/theme-store.ts, lib/stores/program-store.ts). The root layout
// stays a Server Component — only Auth needs a Provider because it depends
// on the Firebase Auth SDK's user state.
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Runtime config (superadmin console). Server-cached (memory → Firestore); degrades to defaults.
  const appConfig = await getAppConfig();
  // Active locale (cookie/Accept-Language) for <html lang> and the intl provider.
  const locale = await getLocale();
  // Team the visitor follows without an account (pride_team cookie).
  const followedTeam = parseFollowedTeam((await cookies()).get(FOLLOW_TEAM_COOKIE)?.value);
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
                <AppShell followedTeam={followedTeam} />
                <div className="md:ml-56 min-h-screen pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
                  {children}
                </div>
                <DeferredGlobals aiAssistant={appConfig.features.aiAssistant} />
                <PWAInstallPrompt />
                <Toaster
                  theme="dark"
                  position="top-right"
                  richColors
                  closeButton
                  toastOptions={{
                    style: { fontSize: "13px" },
                  }}
                />
              </ConfirmProvider>
            </AuthProvider>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
