import { CalendarDays, ClipboardList, Home, Swords, Users, BarChart2, Target, IdCard, Wrench, Timer, type LucideIcon } from "lucide-react";

/**
 * Navigation model of the app shell (plan "PRIDE abierta al público", §1).
 * Five primary destinations organized by what the user wants to do; tools that
 * are not part of the competition loop live in the secondary "more" list.
 * Labels are keys in the `Shell` i18n namespace.
 */
export interface NavItem {
    href: string;
    labelKey: string;
    icon: LucideIcon;
    /** Path prefixes that mark this item active (besides an exact href match). */
    match?: string[];
}

export const PRIMARY_NAV: NavItem[] = [
    { href: "/", labelKey: "nav.today", icon: Home },
    { href: "/events", labelKey: "nav.events", icon: CalendarDays, match: ["/events", "/event/"] },
    { href: "/teams", labelKey: "nav.teams", icon: Users, match: ["/teams", "/team/"] },
    { href: "/scouting", labelKey: "nav.scouting", icon: ClipboardList, match: ["/scouting"] },
    { href: "/strategy", labelKey: "nav.strategy", icon: Swords, match: ["/strategy"] },
];

export const SECONDARY_NAV: NavItem[] = [
    { href: "/analytics", labelKey: "more.dataLab", icon: BarChart2, match: ["/analytics"] },
    { href: "/oracle", labelKey: "more.oracle", icon: Target, match: ["/oracle"] },
    { href: "/card", labelKey: "more.card", icon: IdCard, match: ["/card"] },
    { href: "/lending", labelKey: "more.lending", icon: Wrench, match: ["/lending"] },
    { href: "/workshop", labelKey: "more.workshop", icon: Timer, match: ["/workshop"] },
];

export function isActive(item: NavItem, pathname: string): boolean {
    if (pathname === item.href) return true;
    return (item.match ?? []).some(p => pathname.startsWith(p));
}
