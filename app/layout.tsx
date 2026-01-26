import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { SeasonProvider } from "@/context/SeasonContext";
import { AuthProvider } from "@/context/AuthContext";
import AssistantChat from "@/components/ai/AssistantChat";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FTC Stats México",
  description: "Estadísticas y Proyecciones de Avance para FIRST Tech Challenge México",
};

import { cookies } from "next/headers";
import { fetchEvents } from "@/lib/ftc-api";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const season = Number(cookieStore.get("ftc_season")?.value || 2024);
  const allEvents = await fetchEvents(season);

  // Filter for Mexican regionals (starting with MX)
  const mexicanEvents = allEvents
    .filter(e => e.code.startsWith("MX"))
    .sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime());

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-white`}
      >
        <SeasonProvider>
          <AuthProvider>
            <Sidebar initialEvents={mexicanEvents} />
            <div className="md:ml-60 min-h-screen transition-all duration-300 pb-20 md:pb-0">
              {children}
            </div>
            <AssistantChat />
          </AuthProvider>
        </SeasonProvider>
      </body>
    </html>
  );
}
