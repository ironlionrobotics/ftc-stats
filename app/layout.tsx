import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
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

// Direction C "Nightshift" typography. Space Grotesk carries both display and
// body with an "instrument panel" voice; JetBrains Mono handles tabular data.
// Both are variable fonts, so no explicit weight list is needed.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

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
  themeColor: "#08090c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Dark-first (Direction C): apply the theme class before first paint so a
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
  // Runtime config (superadmin console). Redis-cached; degrades to defaults.
  const appConfig = await getAppConfig();
  return (
    // suppressHydrationWarning: the themeInitScript below sets the `dark` class
    // on <html> before hydration, which intentionally differs from the server
    // markup. Scoped to this element only (standard next-themes pattern).
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeSync />
        <QueryProvider>
          <AuthProvider>
            <ConfirmProvider>
              <Sidebar />
              <div className="md:ml-60 min-h-screen transition-all duration-300 pb-20 md:pb-0">
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
      </body>
    </html>
  );
}
