"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Search, Moon, Sun, SunMoon, LogIn, LogOut, X, Star, User as UserIcon, Menu } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/lib/stores/theme-store";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { setFollowedTeamAction } from "@/app/actions/follow-team";
import { replaceFollowsAction } from "@/app/actions/following";
import { mergeFollows, normalizeFollows, sameFollows, type Follows } from "@/lib/follows";
import { mirrorFollows } from "@/lib/follows-sync";
import { syncPushFollows } from "@/lib/push-client";
import { deleteMyAccountAction } from "@/app/actions/delete-account";
import { MOBILE_TABS, RAIL_NAV, SECONDARY_NAV, moreNavFor, isActive, type NavItem } from "./nav";
import EventSwitcher from "./EventSwitcher";
import { Sheet } from "@/components/ui/Sheet";
import { useAssistantPref } from "@/lib/stores/assistant-pref";
import type { EventSummary } from "@/lib/active-event-context";

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
 * App shell (decision #116, direction "Oro").
 *  - Desktop/tablet rail: the active-event switcher, team search, Hoy · Evento
 *    · Capturar · Equipos · Estrategia, the "more" tools and the account.
 *  - Phone: top bar (brand, active-event chip, team search, account) and a
 *    bottom bar with the four event-day tasks plus "Más" — one thumb.
 *  - Account panel (both): followed team, theme, language, assistant button,
 *    sign in/out, team-admin panels, FIRST attribution.
 * `followedTeam` comes from the `pride_team` cookie and `activeEvent` from
 * lib/active-event-server.ts (both read in the root layout).
 */
export default function AppShell({ followedTeam, follows, activeEvent, eventOptions, aiAssistant, frc = true }: {
    followedTeam: number | null;
    follows: Follows;
    activeEvent: EventSummary | null;
    eventOptions: EventSummary[];
    aiAssistant: boolean;
    /** `frc` feature flag (#119): hides the FRC entry of "Más". */
    frc?: boolean;
}) {
    const pathname = usePathname();
    const t = useTranslations("Shell");
    const [panelOpen, setPanelOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const MORE_NAV = moreNavFor(frc);
    const moreActive = MORE_NAV.some(item => isActive(item, pathname)) && !MOBILE_TABS.some(item => isActive(item, pathname));
    const { user, userDoc } = useAuth();
    const team = followedTeam ?? (userDoc?.orgId ? Number(userDoc.orgId) : null);
    const router = useRouter();

    // A signed-in member with no followed team follows their own team, so the
    // server-rendered "Hoy" (which only sees the cookie) shows it.
    const orgTeam = userDoc?.orgId ? Number(userDoc.orgId) : null;
    useEffect(() => {
        if (followedTeam !== null || orgTeam === null || !Number.isInteger(orgTeam)) return;
        let cancelled = false;
        (async () => {
            const res = await setFollowedTeamAction(orgTeam);
            if (res.ok) void syncPushFollows();
            if (!cancelled && res.ok) router.refresh();
        })();
        return () => { cancelled = true; };
    }, [followedTeam, orgTeam, router]);

    // Signing in merges this device's follows with the account's (decision #110),
    // once per user: the cookie feeds the server pages, the doc travels between devices.
    const mergedFor = useRef<string | null>(null);
    useEffect(() => {
        if (!user || !userDoc || mergedFor.current === user.uid) return;
        mergedFor.current = user.uid;
        const fromDoc = normalizeFollows(userDoc.follows);
        const merged = mergeFollows(follows, fromDoc);
        if (!sameFollows(merged, fromDoc)) void mirrorFollows(user.uid, merged);
        if (!sameFollows(merged, follows)) {
            void replaceFollowsAction(merged).then(() => { void syncPushFollows(); router.refresh(); });
        }
    }, [user, userDoc, follows, router]);

    return (
        <>
            <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-3 focus:font-bold focus:text-brand-foreground">
                {t("skip")}
            </a>

            {/* Desktop/tablet rail */}
            <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-56 flex-col border-r border-border bg-card">
                <Brand />
                <div className="space-y-2 px-3 pb-3">
                    <EventSwitcher active={activeEvent} options={eventOptions} wide />
                    <TeamSearch />
                </div>
                <nav className="flex flex-col gap-0.5 px-3" aria-label={t("aria.primary")}>
                    {RAIL_NAV.map(item => <RailLink key={item.href} item={eventHref(item, activeEvent)} active={isActive(item, pathname)} label={t(item.labelKey)} />)}
                </nav>
                <p className="mt-5 mb-1 px-6 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("more.title")}</p>
                <nav className="flex flex-col gap-0.5 px-3" aria-label={t("aria.more")}>
                    {SECONDARY_NAV.map(item => <RailLink key={item.href} item={item} active={isActive(item, pathname)} label={t(item.labelKey)} small />)}
                </nav>
                <div className="mt-auto border-t border-border p-3">
                    <AccountButton team={team} onClick={() => setPanelOpen(true)} wide />
                </div>
            </aside>

            {/* Phone top bar */}
            <header className="md:hidden sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3">
                <Link href="/" className="shrink-0 px-1 font-black tracking-[0.04em] text-foreground">PRIDE</Link>
                <div className="min-w-0 flex-1"><EventSwitcher active={activeEvent} options={eventOptions} /></div>
                <button type="button" onClick={() => setSearchOpen(true)} aria-label={t("search.open")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted">
                    <Search className="h-5 w-5" />
                </button>
                <AccountButton team={team} onClick={() => setPanelOpen(true)} />
            </header>

            {/* Phone bottom bar: four tasks + Más */}
            <nav
                className="md:hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
                aria-label={t("aria.primary")}
            >
                {MOBILE_TABS.map(item => (
                    <TabLink key={item.href} item={eventHref(item, activeEvent)} active={isActive(item, pathname)} label={t(item.labelKey)} />
                ))}
                <button
                    type="button"
                    onClick={() => setMoreOpen(true)}
                    aria-expanded={moreOpen}
                    className={clsx("relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs", moreActive ? "font-bold text-foreground" : "text-muted-foreground")}
                >
                    {moreActive && <span className="absolute top-0 h-[3px] w-8 rounded-b bg-brand" aria-hidden />}
                    <Menu className="h-5 w-5" strokeWidth={moreActive ? 2.5 : 2} />
                    {t("nav.more")}
                </button>
            </nav>

            <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t("more.title")} closeLabel={t("account.close")}>
                <nav aria-label={t("aria.more")} className="divide-y divide-border">
                    {MORE_NAV.map(item => {
                        const Icon = item.icon;
                        const active = isActive(item, pathname);
                        return (
                            <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)} aria-current={active ? "page" : undefined}
                                className={clsx("flex min-h-[52px] items-center gap-3 px-1 text-base", active ? "font-semibold text-foreground" : "text-foreground/90")}>
                                <Icon className={clsx("h-5 w-5", active ? "text-brand-ink" : "text-muted-foreground")} /> {t(item.labelKey)}
                            </Link>
                        );
                    })}
                </nav>
            </Sheet>

            <Sheet open={searchOpen} onClose={() => setSearchOpen(false)} title={t("search.open")} closeLabel={t("account.close")}>
                <p className="mb-2 text-sm text-muted-foreground">{t("search.hint")}</p>
                <TeamSearch large onDone={() => setSearchOpen(false)} />
            </Sheet>

            {panelOpen && <AccountPanel team={followedTeam} aiAssistant={aiAssistant} onClose={() => setPanelOpen(false)} />}
        </>
    );
}

/** The Evento tab links straight to the active event (works offline from the SW cache); `/event` redirects otherwise. */
function eventHref(item: NavItem, active: EventSummary | null): NavItem {
    return item.href === "/event" && active ? { ...item, href: `/event/${active.code}` } : item;
}

function TabLink({ item, active, label }: { item: NavItem; active: boolean; label: string }) {
    const Icon = item.icon;
    return (
        <Link
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx("relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs", active ? "font-bold text-foreground" : "text-muted-foreground")}
        >
            {active && <span className="absolute top-0 h-[3px] w-8 rounded-b bg-brand" aria-hidden />}
            <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
            {label}
        </Link>
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
                small ? "min-h-[40px] text-sm" : "min-h-[44px] text-sm",
                active ? "bg-muted font-semibold text-foreground shadow-[inset_3px_0_0_var(--color-brand)]" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
        >
            <Icon className={clsx(small ? "h-4 w-4" : "h-[18px] w-[18px]", active && "text-brand-ink")} />
            {label}
        </Link>
    );
}

function TeamSearch({ large, onDone }: { large?: boolean; onDone?: () => void }) {
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
                    onDone?.();
                }
            }}
            className={clsx("relative", large && "flex gap-2")}
        >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
                value={q}
                onChange={e => setQ(e.target.value)}
                inputMode="numeric"
                enterKeyHint="go"
                autoFocus={large}
                placeholder={t("search.placeholder")}
                aria-label={t("search.placeholder")}
                className={clsx(
                    "w-full rounded-lg border border-border bg-muted pl-8 pr-2 text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none",
                    large ? "h-12 min-w-0 flex-1 font-mono text-lg tabular-nums" : "h-10 text-sm",
                )}
            />
            {large && (
                <button type="submit" className="h-12 shrink-0 rounded-lg bg-brand px-4 text-sm font-bold text-brand-foreground">
                    {t("search.go")}
                </button>
            )}
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

function AccountPanel({ team, aiAssistant, onClose }: { team: number | null; aiAssistant: boolean; onClose: () => void }) {
    const t = useTranslations("Shell");
    const tAttr = useTranslations("Attribution");
    const pathname = usePathname();
    const { user, userDoc, signInWithGoogle, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const hydrated = useHydrated();
    const router = useRouter();
    const [teamInput, setTeamInput] = useState(team ? String(team) : "");
    const [pending, startTransition] = useTransition();

    const follow = (value: number | null) =>
        startTransition(async () => {
            await setFollowedTeamAction(value);
            void syncPushFollows();
            router.refresh();
        });

    return (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t("account.menu")}>
            <button className="absolute inset-0 bg-black/60" aria-label={t("account.close")} onClick={onClose} />
            <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[8px] border-t border-border bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-3 md:left-3 md:w-[360px] md:rounded-[6px] md:border">
                <div className="mb-4 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("account.menu")}</span>
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

                {/* Preferences */}
                <section className="mb-5 flex items-center gap-3">
                    <button
                        onClick={toggleTheme}
                        disabled={!hydrated}
                        className="flex h-9 items-center gap-2 rounded-[4px] border border-border px-3 text-sm text-foreground hover:bg-muted"
                    >
                        {!hydrated || theme === "system" ? <SunMoon className="h-4 w-4" /> : theme === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        {t(`theme.${hydrated ? theme : "system"}`)}
                    </button>
                    <div className="flex-1"><LocaleSwitcher /></div>
                </section>
                {aiAssistant && <AssistantToggle />}

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
                            <DeleteAccount onDeleted={() => { logout(); onClose(); }} />
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

                <p className="text-xs text-muted-foreground">
                    {tAttr("prefix")}{" "}
                    {pathname.startsWith("/frc") ? (
                        <a href="https://frc-events.firstinspires.org/services/API" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                            {tAttr("linkLabelFrc")}
                        </a>
                    ) : (
                        <a href="https://www.firstinspires.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                            {tAttr("linkLabel")}
                        </a>
                    )}
                </p>
            </div>
        </div>
    );
}

/** Self-service account deletion (decision #97): type DELETE to confirm. */
function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
    const t = useTranslations("Shell");
    const tErr = useTranslations("Errors");
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    if (!user) return null;
    if (!open) {
        return (
            <button onClick={() => setOpen(true)} className="text-xs text-muted-foreground underline hover:text-danger">
                {t("delete.open")}
            </button>
        );
    }
    return (
        <div className="space-y-2 rounded-[4px] border border-danger/40 p-3">
            <p className="text-xs text-muted-foreground">{t("delete.explain")}</p>
            <input
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="DELETE"
                aria-label={t("delete.confirmLabel")}
                className="h-9 w-full rounded-[4px] border border-border bg-muted px-2 font-mono text-sm text-foreground focus:border-danger focus:outline-none"
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex gap-2">
                <button
                    disabled={pending || confirm !== "DELETE"}
                    onClick={() => startTransition(async () => {
                        setError(null);
                        const res = await deleteMyAccountAction({ idToken: await user.getIdToken(), confirm });
                        if (res.ok) onDeleted();
                        else setError(tErr(res.code));
                    })}
                    className="h-9 rounded-[4px] bg-danger px-3 text-sm font-semibold text-white disabled:opacity-40"
                >
                    {t("delete.submit")}
                </button>
                <button onClick={() => { setOpen(false); setConfirm(""); }} className="h-9 px-2 text-sm text-muted-foreground">
                    {t("delete.cancel")}
                </button>
            </div>
        </div>
    );
}

/** Opt-in floating assistant button (#116: nothing floats over content by default). */
function AssistantToggle() {
    const t = useTranslations("Shell");
    const hydrated = useHydrated();
    const show = useAssistantPref(s => s.showLauncher);
    const setShow = useAssistantPref(s => s.setShowLauncher);
    const on = hydrated && show;
    return (
        <section className="mb-5 flex items-center justify-between gap-3">
            <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{t("assistant.label")}</p>
                <p className="text-xs text-muted-foreground">{t("assistant.help")}</p>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={t("assistant.label")}
                disabled={!hydrated}
                onClick={() => setShow(!show)}
                className={clsx("relative h-7 w-12 shrink-0 rounded-full border transition-colors", on ? "border-brand bg-brand" : "border-border bg-muted")}
            >
                <span className={clsx("absolute top-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform", on ? "translate-x-6" : "translate-x-0.5")} />
            </button>
        </section>
    );
}
