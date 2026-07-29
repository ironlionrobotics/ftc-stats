"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Home, ClipboardList, Menu, X, BarChart2, Sun, Moon, Swords, Target } from "lucide-react";
import clsx from "clsx";
import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/lib/stores/theme-store";
import { useProgram } from "@/lib/stores/program-store";
import dynamic from "next/dynamic";

// Admin/lead-only panels, rendered inside the signed-in block below. They reach
// Firestore through lib/orgs, and the Sidebar lives in the root layout — so
// importing them statically put the entire Firebase client SDK (~397 KB) into
// the chunk EVERY page downloads, including the fully public ones where nobody
// is signed in and these never render. Deferred so that cost is paid only by
// the sessions that actually open them.
const InviteGenerator = dynamic(() => import("@/components/auth/InviteGenerator"), { ssr: false });
const GroundTruthValidator = dynamic(() => import("@/components/auth/GroundTruthValidator"), { ssr: false });
const DiscordSettings = dynamic(() => import("@/components/auth/DiscordSettings"), { ssr: false });
const RpModelTrainer = dynamic(() => import("@/components/auth/RpModelTrainer"), { ssr: false });

// Returns false during SSR + the initial (hydrating) client render, true after
// hydration — the standard useSyncExternalStore idiom. Replaces the
// useState(false) + setState-in-effect "mounted" flag (which the React Compiler
// flags as a cascading-render hazard) with no behavior change: theme-dependent
// UI still stays inert until the client has hydrated, avoiding a mismatch.
const emptySubscribe = () => () => {};
function useHydrated(): boolean {
    return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { user, userDoc, signInWithGoogle, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { program, setProgram } = useProgram();

    const mounted = useHydrated();
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    // const currentSeason = Number(searchParams.get("season") || "2024");
    // const currentRegion = searchParams.get("region") || "MX";
    // const currentEventType = searchParams.get("eventType") || "All";

    const handleLinkClick = () => setIsOpen(false);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchTerm.trim()) {
            router.push(`/team/${searchTerm.trim()}`);
            setSearchTerm("");
            setIsOpen(false);
        }
    };



    return (
        <>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="md:hidden fixed top-4 right-4 z-50 p-2 bg-background/80 backdrop-blur-md rounded-lg border border-border text-foreground"
            >
                {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {isOpen && (
                <div
                    className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                    onClick={() => setIsOpen(false)}
                />
            )}

            <aside
                className={clsx(
                    "fixed top-0 left-0 h-screen w-60 bg-card border-r border-border z-40 transition-transform duration-300 ease-in-out overflow-y-auto",
                    isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
                )}
            >
                <div className="p-6 flex flex-col h-full">
                    <div className="mb-6 flex items-center gap-3 px-2">
                        <div className="w-10 h-10 relative">
                            <Image src="/icon.png" alt="Logo" fill className="object-contain" />
                        </div>
                        <div>
                            <h1 className="font-display font-extrabold text-foreground text-xl tracking-tight">
                                PRIDE
                            </h1>
                            <p className="text-[10px] text-secondary font-medium tracking-[0.18em] uppercase">FTC Analytics · MX</p>
                        </div>
                    </div>
                    <p className="px-2 -mt-4 mb-4 font-mono text-[10px] tracking-wide text-muted-foreground">
                        por <span className="text-primary font-bold">Iron Lion</span> Robotics · FTC #30311
                    </p>

                    <form onSubmit={handleSearch} className="mb-6 px-2">
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Find Team #"
                                className="w-full bg-muted border border-border text-foreground text-sm rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-primary placeholder:text-muted-foreground"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                        </div>
                    </form>

                    <nav className="flex-1 space-y-1">
                        <p className="px-4 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-2 mt-2">Main</p>
                        <NavItem href="/" icon={Home} isActive={pathname === "/"} onClick={handleLinkClick}>
                            General Stats
                        </NavItem>
                        <NavItem href="/scouting" icon={ClipboardList} isActive={pathname === "/scouting"} onClick={handleLinkClick}>
                            Scouting Form
                        </NavItem>
                        <NavItem href="/strategy" icon={Swords} isActive={pathname === "/strategy"} onClick={handleLinkClick}>
                            Estrategia
                        </NavItem>
                        <NavItem href="/analytics" icon={BarChart2} isActive={pathname === "/analytics"} onClick={handleLinkClick}>
                            Data Lab <span className="ml-auto text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold">NEW</span>
                        </NavItem>
                        {/* Public accuracy record. Linked from the main nav on purpose:
                            a page nobody can find is not transparency. */}
                        <NavItem href="/oracle" icon={Target} isActive={pathname === "/oracle"} onClick={handleLinkClick}>
                            Precisión del Oracle
                        </NavItem>
                    </nav>

                    {/* Theme Toggle & Auth Section */}
                    <div className="mt-auto pt-6 border-t border-border/50 space-y-4">
                        <div className="px-2">
                            <button
                                onClick={toggleTheme}
                                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-muted border border-border hover:bg-muted/80 transition-all group"
                                disabled={!mounted}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                                        {mounted && theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
                                    </div>
                                    <span className="text-sm font-bold text-muted-foreground group-hover:text-foreground capitalize">{mounted ? theme : '...'} Mode</span>
                                </div>
                                <div className="w-8 h-4 bg-border/50 rounded-full relative p-0.5">
                                    <div className={clsx(
                                        "w-3 h-3 rounded-full bg-foreground transition-all transform",
                                        mounted && theme === 'dark' ? "translate-x-4" : "translate-x-0"
                                    )} />
                                </div>
                            </button>

                            <button
                                onClick={() => setProgram(program === 'FTC' ? 'FRC' : 'FTC')}
                                className="w-full mt-2 flex items-center justify-between px-4 py-2.5 rounded-xl bg-muted border border-border hover:bg-muted/80 transition-all group"
                                disabled={!mounted}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={clsx("p-1.5 rounded-lg text-primary-foreground flex-shrink-0 font-black text-[10px]", program === 'FTC' ? "bg-primary" : "bg-secondary")}>
                                        {mounted ? program : '...'}
                                    </div>
                                    <span className="text-sm font-bold text-muted-foreground group-hover:text-foreground">App Mode</span>
                                </div>
                                <div className="text-xs font-bold text-muted-foreground">
                                    Swap
                                </div>
                            </button>
                        </div>

                        {mounted ? (
                            user ? (
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center gap-3 px-2">
                                        <div className="w-10 h-10 rounded-full border border-primary/30 overflow-hidden relative flex-shrink-0">
                                            {user.photoURL ? (
                                                <Image src={user.photoURL} alt="Profile" fill className="object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                                                    {user.displayName?.charAt(0) || user.email?.charAt(0) || "?"}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-foreground truncate">{user.displayName || "User"}</p>
                                            <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                                            {userDoc?.orgId && (
                                                <p className="text-[10px] text-primary font-bold mt-0.5">
                                                    Equipo #{userDoc.orgId}
                                                    {userDoc.role !== "scout" && (
                                                        <span className="ml-1 px-1 py-0.5 bg-primary/20 rounded text-[8px] uppercase">
                                                            {userDoc.role}
                                                        </span>
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <InviteGenerator />
                                    <GroundTruthValidator />
                                    <RpModelTrainer />
                                    <DiscordSettings />
                                    <button
                                        onClick={() => logout()}
                                        className="w-full px-4 py-2 rounded-xl bg-muted hover:bg-danger/10 text-muted-foreground hover:text-danger text-xs font-bold transition-all border border-transparent hover:border-danger/20"
                                    >
                                        Cerrar Sesión
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => signInWithGoogle()}
                                    className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold transition-all shadow-sm hover:bg-primary/90 active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                                        <path
                                            fill="currentColor"
                                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                        />
                                        <path
                                            fill="currentColor"
                                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                        />
                                        <path
                                            fill="currentColor"
                                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                        />
                                        <path
                                            fill="currentColor"
                                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                        />
                                    </svg>
                                    Iniciar Sesión
                                </button>
                            )
                        ) : (
                            <div className="h-12 w-full bg-muted animate-pulse rounded-xl" />
                        )}
                    </div>
                </div>
            </aside>
        </>
    );
}

interface NavItemProps {
    href: string;
    icon: React.ElementType; // Using ElementType is safer for Lucide icons
    children: React.ReactNode;
    className?: string;
    isActive: boolean;
    onClick: () => void;
}

function NavItem({ href, icon: Icon, children, className = "", isActive, onClick }: NavItemProps) {
    return (
        <Link
            href={href}
            onClick={onClick}
            className={clsx(
                // 44px min for WCAG tap target on tablet/mobile. Active-scale gives
                // visible feedback for "I tapped this" before route transition starts.
                "min-h-[44px] flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm group",
                "active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                isActive
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                className
            )}
        >
            <Icon className={clsx("w-5 h-5 flex-shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground transition-colors")} />
            <span className="truncate">{children}</span>
        </Link>
    );
}

