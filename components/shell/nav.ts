import { CalendarDays, CalendarRange, ClipboardList, Home, Swords, Users, BarChart2, Target, IdCard, Wrench, Timer, Info, type LucideIcon } from "lucide-react";

/**
 * Navigation model of the app shell (decision #116, direction "Oro").
 * Organized by the four event-day tasks: my day (Hoy), the active event,
 * capturing scouting, and looking up a team. Strategy is a tablet/desktop
 * tool: in the rail on wide screens, under "Más" on phones.
 * Labels are keys in the `Shell` i18n namespace.
 */
export interface NavItem {
    href: string;
    labelKey: string;
    icon: LucideIcon;
    /** Path prefixes that mark this item active (besides an exact href match). */
    match?: string[];
}

const TODAY: NavItem = { href: "/", labelKey: "nav.today", icon: Home };
/** `/event` redirects to the active event (app/event/page.tsx). */
const EVENT: NavItem = { href: "/event", labelKey: "nav.event", icon: CalendarDays, match: ["/event/"] };
const CAPTURE: NavItem = { href: "/scouting", labelKey: "nav.capture", icon: ClipboardList, match: ["/scouting"] };
const TEAMS: NavItem = { href: "/teams", labelKey: "nav.teams", icon: Users, match: ["/teams", "/team/"] };
const STRATEGY: NavItem = { href: "/strategy", labelKey: "nav.strategy", icon: Swords, match: ["/strategy"] };
const ALL_EVENTS: NavItem = { href: "/events", labelKey: "more.allEvents", icon: CalendarRange, match: ["/events"] };

/** Phone bottom bar: four tasks + a "Más" button (rendered by the shell). */
export const MOBILE_TABS: NavItem[] = [TODAY, EVENT, CAPTURE, TEAMS];
/** Tablet/desktop rail. */
export const RAIL_NAV: NavItem[] = [TODAY, EVENT, CAPTURE, TEAMS, STRATEGY];

const TOOLS: NavItem[] = [
    { href: "/lending", labelKey: "more.lending", icon: Wrench, match: ["/lending"] },
    { href: "/workshop", labelKey: "more.workshop", icon: Timer, match: ["/workshop"] },
    { href: "/card", labelKey: "more.card", icon: IdCard, match: ["/card"] },
    { href: "/analytics", labelKey: "more.dataLab", icon: BarChart2, match: ["/analytics"] },
    { href: "/oracle", labelKey: "more.oracle", icon: Target, match: ["/oracle"] },
    { href: "/acerca", labelKey: "more.about", icon: Info, match: ["/acerca"] },
];

/** Rail "more" list. */
export const SECONDARY_NAV: NavItem[] = [ALL_EVENTS, ...TOOLS];
/** Phone "Más" sheet: strategy first, then the rest. */
export const MORE_NAV: NavItem[] = [STRATEGY, ALL_EVENTS, ...TOOLS];

export function isActive(item: NavItem, pathname: string): boolean {
    if (pathname === item.href) return true;
    return (item.match ?? []).some(p => pathname.startsWith(p));
}
