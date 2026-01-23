"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MEXICAN_EVENTS } from "@/lib/constants";
import { Home, ClipboardList, MapPin, Trophy, Menu, X, BarChart3 } from "lucide-react";
import clsx from "clsx";
import { useState } from "react";
import Image from "next/image";

export default function Sidebar() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);

    // Close sidebar when clicking a link on mobile
    const handleLinkClick = () => setIsOpen(false);

    const NavItem = ({ href, icon: Icon, children, className = "" }: { href: string; icon: any; children: React.ReactNode; className?: string }) => {
        const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
            <Link
                href={href}
                onClick={handleLinkClick}
                className={clsx(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm group",
                    isActive
                        ? "bg-primary/20 text-primary border border-primary/20 shadow-[0_0_15px_rgba(249,115,22,0.1)]"
                        : "text-gray-400 hover:text-white hover:bg-white/5",
                    className
                )}
            >
                <Icon className={clsx("w-5 h-5", isActive ? "text-primary" : "text-gray-500 group-hover:text-white transition-colors")} />
                {children}
            </Link>
        );
    };

    return (
        <>
            {/* Mobile Menu Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="md:hidden fixed top-4 right-4 z-50 p-2 bg-background/80 backdrop-blur-md rounded-lg border border-white/10 text-white"
            >
                {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Sidebar Overlay for Mobile */}
            {isOpen && (
                <div
                    className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar Container */}
            <aside
                className={clsx(
                    "fixed top-0 left-0 h-screen w-60 bg-[#0a0a0b]/95 backdrop-blur-xl border-r border-white/5 z-40 transition-transform duration-300 ease-in-out overflow-y-auto",
                    isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
                )}
            >
                <div className="p-6 flex flex-col h-full">
                    {/* Logo Area */}
                    <div className="mb-8 flex items-center gap-3 px-2">
                        <div className="w-10 h-10 relative">
                            <Image src="/icon.png" alt="Logo" fill className="object-contain" />
                        </div>
                        <div>
                            <h1 className="font-display font-bold text-white text-lg tracking-tight">
                                FTC Stats
                            </h1>
                            <p className="text-xs text-secondary font-medium tracking-wider uppercase">México</p>
                        </div>
                    </div>

                    {/* Main Navigation */}
                    <nav className="flex-1 space-y-1">
                        <p className="px-4 text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 mt-2">Main</p>
                        <NavItem href="/" icon={Home}>
                            General Stats
                        </NavItem>
                        <NavItem href="/scouting" icon={ClipboardList}>
                            Scouting Form
                        </NavItem>

                        <div className="my-6 border-t border-white/5" />

                        <p className="px-4 text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Regionales</p>
                        {MEXICAN_EVENTS.filter(e => e.code !== "MXCMP").map((event) => (
                            <NavItem key={event.code} href={`/event/${event.code}`} icon={MapPin}>
                                {event.name.replace("Regional ", "")}
                            </NavItem>
                        ))}

                        <div className="my-6 border-t border-white/5" />

                        <p className="px-4 text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Championship</p>
                        <NavItem href="/event/MXCMP" icon={Trophy} className="!bg-secondary/10 !text-secondary !border-secondary/20 hover:!bg-secondary/20">
                            Nacional CDMX
                        </NavItem>
                    </nav>

                    {/* Footer Info */}
                    <div className="mt-8 px-4 py-4 bg-white/5 rounded-xl border border-white/5">
                        <p className="text-xs text-gray-400 text-center leading-relaxed">
                            Developed by Iron Lion
                        </p>
                    </div>
                </div>
            </aside>
        </>
    );
}
