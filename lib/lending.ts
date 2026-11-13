/**
 * Pit lending between teams at an event (decision #104).
 *
 * Collections:
 *  - org_inventory/{orgId}_{itemId}  what a team owns; lendable items are visible to approved teams
 *  - event_presence/{season}_{event}_{orgId}  "we're at MXTLQ, pit 12"
 *  - lend_requests/{id}  "anyone have X?" — open / resolved / cancelled
 *  - loans/{id}  lender → borrower, written ONLY by server actions
 *
 * Privacy: teams appear by number, name and pit — never people's names
 * (users are mostly minors, #92).
 */

export const INVENTORY_CATEGORIES = ["part", "tool", "consumable"] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

export interface InventoryItem {
    orgId: string;
    teamNumber: number;
    name: string;
    category: InventoryCategory;
    qty: number;
    /** Other teams can see it and ask for it. */
    lendable: boolean;
    /** Consumable the team gives away (zip ties, screws): no return expected. */
    giveaway: boolean;
    updatedAt?: unknown;
}

export interface EventPresence {
    season: number;
    eventCode: string;
    orgId: string;
    teamNumber: number;
    teamName: string;
    pit: string;
    updatedAt?: unknown;
}

export type RequestStatus = "open" | "resolved" | "cancelled";

export interface LendRequest {
    season: number;
    eventCode: string;
    orgId: string;
    teamNumber: number;
    pit: string;
    item: string;
    note: string;
    status: RequestStatus;
    createdAt?: { seconds: number } | null;
}

export type LoanStatus = "lent" | "return_marked" | "returned" | "given";

export interface Loan {
    season: number;
    eventCode: string;
    lenderOrg: string;
    lenderTeam: number;
    /** null when the borrowing team isn't on PRIDE: the lender tracks it alone. */
    borrowerOrg: string | null;
    borrowerTeam: number;
    item: string;
    qty: number;
    giveaway: boolean;
    status: LoanStatus;
    /** Orgs allowed to read it (rules: myOrgId in parties). */
    parties: string[];
    lentAtMs: number;
    returnMarkedAtMs?: number;
    returnedAtMs?: number;
    requestId?: string;
}

export const LIMITS = { name: 60, note: 200, pit: 10, qtyMax: 999 } as const;

export function cleanText(raw: unknown, max: number): string {
    return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function isOpenLoan(l: Pick<Loan, "status">): boolean {
    return l.status === "lent" || l.status === "return_marked";
}

/**
 * Next status when `who` presses "returned". The borrower can only mark it
 * (the lender confirms); the lender can close it directly (it got the item
 * back, or the borrower isn't on PRIDE). Null = not allowed from here.
 */
export function nextLoanStatus(status: LoanStatus, who: "lender" | "borrower"): LoanStatus | null {
    if (status === "lent") return who === "lender" ? "returned" : "return_marked";
    if (status === "return_marked") return who === "lender" ? "returned" : null;
    return null;
}

/** Case- and accent-insensitive match for searching items and requests. */
export function matchesQuery(text: string, query: string): boolean {
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const q = norm(query).trim();
    if (!q) return true;
    const hay = norm(text);
    return q.split(/\s+/).every(w => hay.includes(w));
}

/** Lendable items of teams checked in at the event, matching a query, by team. */
export function itemsAtEvent(
    items: InventoryItem[],
    present: EventPresence[],
    query: string,
    excludeOrg?: string,
): Array<{ item: InventoryItem; presence: EventPresence }> {
    const byOrg = new Map(present.map(p => [p.orgId, p]));
    return items
        .filter(i => i.lendable && i.qty > 0 && i.orgId !== excludeOrg && byOrg.has(i.orgId) && matchesQuery(i.name, query))
        .map(i => ({ item: i, presence: byOrg.get(i.orgId)! }))
        .sort((a, b) => a.presence.teamNumber - b.presence.teamNumber || a.item.name.localeCompare(b.item.name));
}
