import type { NotifyEvent } from "@/lib/notify/diff";
import type { Follows } from "@/lib/follows";

/**
 * Who gets what, and the words (decision #110). Pure: the cron passes the
 * subscription and a translator for its locale.
 *
 * Policy:
 *  - Following a TEAM (or it's "my team"): its "soon" and every result,
 *    alliances and champion — told from that team's side.
 *  - Following an EVENT: the milestones only — alliance selection, playoff
 *    results and the champion. Never 40 qual results.
 *  - Categories can be switched off per device.
 * Text carries team numbers, labels and scores only (#92: no person names).
 */

export interface NotifyPrefs {
    soon: boolean;
    results: boolean;
    playoffs: boolean;
    pride: boolean;
}

export const DEFAULT_PREFS: NotifyPrefs = { soon: true, results: true, playoffs: true, pride: true };

export interface Subscriber {
    follows: Follows;
    myTeam: number | null;
    prefs: NotifyPrefs;
}

export interface PushPayload {
    title: string;
    body: string;
    url: string;
    /** Same tag replaces instead of stacking (one per match/milestone). */
    tag: string;
}

export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Teams this subscriber cares about, "my team" first. */
function watched(sub: Subscriber): number[] {
    return [...(sub.myTeam ? [sub.myTeam] : []), ...sub.follows.teams.filter(t => t !== sub.myTeam)];
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const join = (teams: number[]) => teams.join(" · ");

export function compose(ev: NotifyEvent, sub: Subscriber, ctx: { eventName: string; t: Translate }): PushPayload | null {
    const { t, eventName } = ctx;
    const team = watched(sub).find(n => ev.teams.includes(n)) ?? null;
    const followsEvent = sub.follows.events.includes(ev.eventCode);
    const url = `/event/${ev.eventCode}`;

    switch (ev.kind) {
        case "matchSoon": {
            if (team === null || !sub.prefs.soon) return null;
            const onRed = ev.red.includes(team);
            const pWin = ev.pRed === null ? null : onRed ? ev.pRed : 1 - ev.pRed;
            const partners = (onRed ? ev.red : ev.blue).filter(n => n !== team);
            const opponents = onRed ? ev.blue : ev.red;
            return {
                title: t("soon.title", { team, label: ev.label, ahead: ev.ahead }),
                body: t(pWin === null ? "soon.bodyNoOdds" : "soon.body", { partners: join(partners) || "—", opponents: join(opponents), pct: pWin === null ? "" : pct(pWin), event: eventName }),
                url, tag: `${ev.eventCode}:${ev.key}:soon`,
            };
        }
        case "matchResult": {
            if (team !== null && sub.prefs.results) {
                const onRed = ev.red.includes(team);
                const own = onRed ? ev.redScore : ev.blueScore, opp = onRed ? ev.blueScore : ev.redScore;
                const outcome = own === opp ? "tie" : own > opp ? "won" : "lost";
                const rank = ev.ranks[team];
                return {
                    title: t(`result.${outcome}`, { team, label: ev.label, own, opp }),
                    body: rank ? t("result.rank", { rank, event: eventName }) : eventName,
                    url, tag: `${ev.eventCode}:${ev.key}:result`,
                };
            }
            if (followsEvent && ev.level !== "QUALIFICATION" && sub.prefs.playoffs) {
                return {
                    title: t("playoff.title", { event: eventName, label: ev.label }),
                    body: t("playoff.body", { red: join(ev.red), blue: join(ev.blue), rs: ev.redScore, bs: ev.blueScore }),
                    url, tag: `${ev.eventCode}:${ev.key}:result`,
                };
            }
            return null;
        }
        case "alliances": {
            if (!sub.prefs.playoffs || (team === null && !followsEvent)) return null;
            const mine = team === null ? null : ev.alliances.find(a => a.teams.includes(team)) ?? null;
            return {
                title: mine
                    ? t(mine.teams[0] === team ? "alliances.captain" : "alliances.picked", { team: team!, n: mine.number })
                    : t("alliances.title", { event: eventName }),
                body: ev.alliances.slice(0, 4).map(a => `A${a.number}: ${join(a.teams)}`).join(" · "),
                url, tag: `${ev.eventCode}:alliances`,
            };
        }
        case "champion": {
            if (!sub.prefs.playoffs || (team === null && !followsEvent)) return null;
            return {
                title: team !== null ? t("champion.mine", { team, event: eventName }) : t("champion.title", { event: eventName }),
                body: ev.alliance ? t("champion.bodyAlliance", { n: ev.alliance, teams: join(ev.teams) }) : join(ev.teams),
                url, tag: `${ev.eventCode}:champion`,
            };
        }
    }
}
