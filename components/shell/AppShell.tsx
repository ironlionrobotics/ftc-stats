"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Search, Moon, Sun, LogIn, LogOut, X, Star, User as UserIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/lib/stores/theme-store";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { setFollowedTeamAction } from "@/app/actions/follow-team";
import { PRIMARY_NAV, SECONDARY_NAV, isActive, type NavItem } from "./nav";

// Team-admin panels. Each self-gates on role; deferred so the Firebase client
// SDK they pull in never lands in the chunk every public page downloads.
const InviteGenerator = dynamic(() => import("@/components/auth/InviteGenerator"), { ssr: false });
const GroundTruthValidator = dynamic(() => import("@/components/auth/GroundTruthValidator"), { ssr: false });
const DiscordSettings = dynamic(() => import("@/components/auth/DiscordSettings"), { ssr: false });
const RpModelTrainer = dynamic(() => import("@/components/auth/RpModelTrainer"), { ssr: false });

const emptySubscribe = () => () => {};
function useHydrated(): boolean {
    return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

/**
 * App shell (plan "PRIDE abierta al público", Etapa 1).
 *  - Desktop: left rail with the 5 destinations, team search, "more" tools and
 *    the account button.
 *  - Mobile: top bar (brand, followed team, account) + bottom tab bar with the
 *    5 destinations — reachable with one thumb.
 *  - Account panel (both): followed team, theme, language, sign in/out, the
 *    team-admin panels, and FIRST attribution.
 * `followedTeam` comes from the `pride_team` cookie (read in the root layout).
 */
export default function AppShell({ followedTeam }: { followedTeam: number | null }) {
    const pathname = usePathname();
    const t = useTranslations("Shell");
    const [panelOpen, setPanelOpen] = useState(false);
    const { userDoc } = useAuth();
    const team = followedTeam ?? (userDoc?.orgId ? Number(userDoc.orgId) : null);

    return (
        <>
            {/* Desktop rail */}
            <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-56 flex-col border-r border-border bg-card">
                <Brand />
                <div className="px-3 pb-3"><TeamSearch /></div>
                <nav className="flex flex-col gap-0.5 px-3" aria-label={t("aria.primary")}>
                    {PRIMARY_NAV.map(item => <RailLink key={item.href} item={item} active={isActive(item, pathname)} label={t(item.labelKey)} />)}
                </nav>
                <p className="mt-5 mb-1 px-6 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("more.title")}</p>
                <nav className="flex flex-col gap-0.5 px-3" aria-label={t("aria.more")}>
                    {SECONDARY_NAV.map(item => <RailLink key={item.href} item={item} active={isActive(item, pathname)} label={t(item.labelKey)} small />)}
                </nav>
                <div className="mt-auto border-t border-border p-3">
                    <AccountButton team={team} onClick={() => setPanelOpen(true)} wide />
                </div>
            </aside>

            {/* Mobile top bar */}
            <header className="md:hidden sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/95 px-4">
                <Link href="/" className="font-black tracking-[0.04em] text-foreground">PRIDE</Link>
                <AccountButton team={team} onClick={() => setPanelOpen(true)} />
            </header>

            {/* Mobile bottom tabs */}
            <nav
                className="md:hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
                aria-label={t("aria.primary")}
            >
                {PRIMARY_NAV.map(item => {
                    const active = isActive(item, pathname);
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={clsx(
                                "flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px]",
                                active ? "font-bold text-foreground" : "text-muted-foreground",
                            )}
                        >
                            <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                            {t(item.labelKey)}
                        </Link>
                    );
                })}
            </nav>

            {panelOpen && <AccountPanel team={followedTeam} onClose={() => setPanelOpen(false)} />}
        </>
    );
}

function Brand() {
    return (
        <Link href="/" className="flex items-center gap-2.5 px-6 pt-5 pb-4">
            <span className="relative h-7 w-7"><Image src="/icon.png" alt="" fill sizes="28px" className="object-contain" /></span>
            <span className="text-lg font-black tracking-[0.04em] text-foreground">PRIDE</span>
        </Link>
    );
}

function RailLink({ item, active, label, small }: { item: NavItem; active: boolean; label: string; small?: boolean }) {
    const Icon = item.icon;
    return (
        <Link
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
                "flex items-center gap-3 rounded-[4px] px-3 transition-colors",
                small ? "min-h-[36px] text-[13px]" : "min-h-[40px] text-sm",
                active ? "bg-foreground font-semibold text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
        >
            <Icon className={small ? "h-4 w-4" : "h-[18px] w-[18px]"} />
            {label}
        </Link>
    );
}

function TeamSearch() {
    const t = useTranslations("Shell");
    const router = useRouter();
    const [q, setQ] = useState("");
    return (
        <form
            role="search"
            onSubmit={e => {
                e.preventDefault();
                const n = q.trim();
                if (/^\d{1,5}$/.test(n)) {
                    router.push(`/team/${n}`);
                    setQ("");
                }
            }}
            className="relative"
        >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
                value={q}
                onChange={e => setQ(e.target.value)}
                inputMode="numeric"
                placeholder={t("search.placeholder")}
                aria-label={t("search.placeholder")}
                className="h-9 w-full rounded-[4px] border border-border bg-muted pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
            />
        </form>
    );
}

function AccountButton({ team, onClick, wide }: { team: number | null; onClick: () => void; wide?: boolean }) {
    const t = useTranslations("Shell");
    const { user } = useAuth();
    const hydrated = useHydrated();
    return (
        <button
            onClick={onClick}
            aria-label={t("account.menu")}
            className={clsx(
                "flex items-center gap-2 rounded-[4px] text-left text-sm text-foreground hover:bg-muted",
                wide ? "w-full px-2 py-2" : "px-2 py-1.5",
            )}
        >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                {hydrated && user?.photoURL
                    ? <Image src={user.photoURL} alt="" width={28} height={28} />
                    : <UserIcon className="h-4 w-4 text-muted-foreground" />}
            </span>
            {team !== null && (
                <span className="font-mono text-[15px] font-bold tabular-nums">{team}</span>
            )}
            {wide && (
                <span className="ml-auto truncate text-xs text-muted-foreground">
                    {hydrated && user ? (user.displayName ?? t("account.signedIn")) : t("account.signIn")}
                </span>
            )}
        </button>
    );
}

function AccountPanel({ team, onClose }: { team: number | null; onClose: () => void }) {
    const t = useTranslations("Shell");
    const tAttr = useTranslations("Attribution");
    const { user, userDoc, signInWithGoogle, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const hydrated = useHydrated();
    const pathname = usePathname();
    const router = useRouter();
    const [teamInput, setTeamInput] = useState(team ? String(team) : "");
    const [pending, startTransition] = useTransition();

    const follow = (value: number | null) =>
        startTransition(async () => {
            await setFollowedTeamAction(value);
            router.refresh();
        });

    return (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t("account.menu")}>
            <button className="absolute inset-0 bg-black/60" aria-label={t("account.close")} onClick={onClose} />
            <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[8px] border-t border-border bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-3 md:left-3 md:w-[360px] md:rounded-[6px] md:border">
                <div className="mb-4 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("account.menu")}</span>
                    <button onClick={onClose} aria-label={t("account.close")} className="p-1 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
                </div>

                {/* Followed team */}
                <section className="mb-5">
                    <label htmlFor="follow-team" className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <Star className="h-4 w-4" /> {t("follow.label")}
                    </label>
                    <p className="mb-2 text-xs text-muted-foreground">{t("follow.help")}</p>
                    <form
                        className="flex gap-2"
                        onSubmit={e => {
                            e.preventDefault();
                            const n = Number(teamInput.trim());
                            if (Number.isInteger(n) && n > 0) follow(n);
                        }}
                    >
                        <input
                            id="follow-team"
                            value={teamInput}
                            onChange={e => setTeamInput(e.target.value)}
                            inputMode="numeric"
                            placeholder={t("follow.placeholder")}
                            className="h-9 w-28 rounded-[4px] border border-border bg-muted px-2 font-mono text-sm tabular-nums text-foreground focus:border-foreground focus:outline-none"
                        />
                        <button disabled={pending} className="h-9 rounded-[4px] bg-foreground px-3 text-sm font-semibold text-background disabled:opacity-50">
                            {t("follow.set")}
                        </button>
                        {team !== null && (
                            <button type="button" disabled={pending} onClick={() => { setTeamInput(""); follow(null); }} className="h-9 px-2 text-sm text-muted-foreground hover:text-foreground">
                                {t("follow.clear")}
                            </button>
                        )}
                    </form>
                </section>

                {/* More tools (mobile only — the rail lists them on desktop) */}
                <nav className="mb-5 md:hidden" aria-label={t("aria.more")}>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("more.title")}</p>
                    {SECONDARY_NAV.map(item => {
                        const Icon = item.icon;
                        return (
                            <Link key={item.href} href={item.href} onClick={onClose}
                                className={clsx("flex min-h-[44px] items-center gap-3 border-b border-border text-sm", isActive(item, pathname) ? "font-semibold text-foreground" : "text-muted-foreground")}>
                                <Icon className="h-4 w-4" /> {t(item.labelKey)}
                            </Link>
                        );
                    })}
                </nav>

                {/* Preferences */}
                <section className="mb-5 flex items-center gap-3">
                    <button
                        onClick={toggleTheme}
                        disabled={!hydrated}
                        className="flex h-9 items-center gap-2 rounded-[4px] border border-border px-3 text-sm text-foreground hover:bg-muted"
                    >
                        {hydrated && theme === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        {hydrated && theme === "light" ? t("theme.light") : t("theme.dark")}
                    </button>
                    <div className="flex-1"><LocaleSwitcher /></div>
                </section>

                {/* Account */}
                <section className="mb-4 border-t border-border pt-4">
                    {hydrated && user ? (
                        <div className="space-y-3">
                            <div className="text-sm">
                                <div className="font-semibold text-foreground">{user.displayName}</div>
                                {userDoc?.orgId && (
                                    <div className="text-xs text-muted-foreground">
                                        {t("account.team", { team: userDoc.orgId })}
                                        {userDoc.role !== "scout" && <span className="ml-1.5 uppercase">· {userDoc.role}</span>}
                                    </div>
                                )}
                            </div>
                            <InviteGenerator />
                            <GroundTruthValidator />
                            <RpModelTrainer />
                            <DiscordSettings />
                            <button onClick={() => { logout(); onClose(); }} className="flex h-9 items-center gap-2 text-sm text-muted-foreground hover:text-danger">
                                <LogOut className="h-4 w-4" /> {t("account.signOut")}
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => signInWithGoogle()}
                            className="flex h-10 w-full items-center justify-center gap-2 rounded-[4px] bg-foreground text-sm font-semibold text-background"
                        >
                            <LogIn className="h-4 w-4" /> {t("account.signInGoogle")}
                        </button>
                    )}
                </section>

                <p className="text-[11px] text-muted-foreground">
                    {tAttr("prefix")}{" "}
                    <a href="https://www.firstinspires.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                        {tAttr("linkLabel")}
                    </a>
                </p>
            </div>
        </div>
    );
}
