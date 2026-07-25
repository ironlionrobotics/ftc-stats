import type { Metadata } from "next";
import { Geist, Geist_Mono, Archivo } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { AuthProvider } from "@/context/AuthContext";
import AssistantChat from "@/components/ai/AssistantChat";
import OnboardingModal from "@/components/auth/OnboardingModal";
import ThemeSync from "@/components/ThemeSync";
import QueryProvider from "@/components/QueryProvider";
import OnlineSync from "@/components/OnlineSync";
import { Toaster } from "sonner";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for headings and big numbers: a grotesque with a technical,
// slightly condensed voice that separates titles from Geist body text.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "FTC Stats México",
  description: "Estadísticas y Proyecciones de Avance para FIRST Tech Challenge México",
  manifest: "/manifest.webmanifest",
  applicationName: "FTC Stats",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FTC Stats",
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
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Theme and program state moved from Context to Zustand stores
// (lib/stores/theme-store.ts, lib/stores/program-store.ts). The root layout
// stays a Server Component — only Auth needs a Provider because it depends
// on the Firebase Auth SDK's user state.
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} antialiased bg-background text-foreground`}
      >
        <ThemeSync />
        <QueryProvider>
          <AuthProvider>
            <ConfirmProvider>
              <Sidebar />
              <div className="md:ml-60 min-h-screen transition-all duration-300 pb-20 md:pb-0">
                {children}
              </div>
              <AssistantChat />
              <OnboardingModal />
              <OnlineSync />
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
