import { CalendarDays, CalendarRange, ClipboardList, Home, Swords, Users, BarChart2, Target, IdCard, Wrench, Timer, Info, Bot, Activity, type LucideIcon } from "lucide-react";

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

/** FRC events (decision #118): its own destination, under "Más" only. */
export const FRC_HREF = "/frc/events";
const FRC: NavItem = { href: FRC_HREF, labelKey: "more.frc", icon: Bot, match: ["/frc/"] };

/** Phone bottom bar: four tasks + a "Más" button (rendered by the shell). */
export const MOBILE_TABS: NavItem[] = [TODAY, EVENT, CAPTURE, TEAMS];
/** Tablet/desktop rail. */
export const RAIL_NAV: NavItem[] = [TODAY, EVENT, CAPTURE, TEAMS, STRATEGY];

/** Robot health (decision #120): under "Más" only, behind the `robotHealth` flag. */
export const ROBOT_HREF = "/robot";

const TOOLS: NavItem[] = [
    { href: "/lending", labelKey: "more.lending", icon: Wrench, match: ["/lending"] },
    { href: "/workshop", labelKey: "more.workshop", icon: Timer, match: ["/workshop"] },
    { href: ROBOT_HREF, labelKey: "more.robot", icon: Activity, match: ["/robot"] },
    { href: "/card", labelKey: "more.card", icon: IdCard, match: ["/card"] },
    { href: "/analytics", labelKey: "more.dataLab", icon: BarChart2, match: ["/analytics"] },
    { href: "/oracle", labelKey: "more.oracle", icon: Target, match: ["/oracle"] },
    { href: "/acerca", labelKey: "more.about", icon: Info, match: ["/acerca"] },
];

/** Rail "more" list. */
export const SECONDARY_NAV: NavItem[] = [ALL_EVENTS, ...TOOLS];
/** Phone "Más" sheet: strategy first, then the rest. */
export const MORE_NAV: NavItem[] = [STRATEGY, ALL_EVENTS, FRC, ...TOOLS];

export interface NavFlags { frc: boolean; robotHealth: boolean }

const visible = (items: NavItem[], flags: NavFlags): NavItem[] =>
    items.filter(i => (i.href !== FRC_HREF || flags.frc) && (i.href !== ROBOT_HREF || flags.robotHealth));

/** "Más" sheet hiding the entries whose feature flag is off (#119, #120). */
export const moreNavFor = (flags: NavFlags): NavItem[] => visible(MORE_NAV, flags);
/** Rail "more" list hiding the entries whose feature flag is off. */
export const secondaryNavFor = (flags: NavFlags): NavItem[] => visible(SECONDARY_NAV, flags);

export function isActive(item: NavItem, pathname: string): boolean {
    if (pathname === item.href) return true;
    return (item.match ?? []).some(p => pathname.startsWith(p));
}
