"use server";

import { getAdminDb } from "@/lib/firebase-admin";
import { callerWithTeam, allowUser } from "@/lib/server-caller";
import { normalizeEventCode, parseSeason, isValidTeamNumber } from "@/lib/input-guards";
import { getCurrentSeason } from "@/lib/constants";
import { cleanText, nextLoanStatus, LIMITS, type Loan } from "@/lib/lending";
import type { ErrorCode } from "@/lib/errors";

/**
 * Loans between teams at an event (decision #104). The loans collection is
 * read-only for clients; every write goes through here so the record of who
 * lent what — and whether it came back — can't be rewritten by either side.
 *
 * Either side can open a loan (whoever remembers first). If the other team
 * isn't on PRIDE the loan has a single party and that team closes it alone.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; code: ErrorCode };

async function orgExists(team: number): Promise<boolean> {
    const snap = await getAdminDb().collection("orgs").doc(String(team)).get();
    return snap.exists;
}

export async function recordLoanAction(input: {
    idToken: string;
    season: number;
    eventCode: string;
    /** The caller's side of the loan. */
    as: "lender" | "borrower";
    otherTeam: number;
    item: string;
    qty: number;
    giveaway: boolean;
    /** Request this loan answers (closed as resolved when the borrower owns it). */
    requestId?: string;
}): Promise<Result<{ loanId: string }>> {
    const season = parseSeason(input.season, getCurrentSeason());
    if (season === undefined) return { ok: false, code: "validation.season" };
    const eventCode = normalizeEventCode(input.eventCode);
    if (!eventCode) return { ok: false, code: "validation.eventCode" };
    if (!isValidTeamNumber(input.otherTeam)) return { ok: false, code: "validation.teamNumber" };
    const item = cleanText(input.item, LIMITS.name);
    if (!item) return { ok: false, code: "lending.itemRequired" };
    const qty = Number.isInteger(input.qty) && input.qty >= 1 && input.qty <= LIMITS.qtyMax ? input.qty : 1;
    if (input.as !== "lender" && input.as !== "borrower") return { ok: false, code: "generic" };

    const who = await callerWithTeam(input.idToken);
    if (!who.ok) return who;
    const me = who.caller;
    if (!(await allowUser("lending", me.uid, 30))) return { ok: false, code: "rateLimited" };
    if (String(input.otherTeam) === me.orgId) return { ok: false, code: "lending.notAllowed" };

    try {
        const otherOrg = (await orgExists(input.otherTeam)) ? String(input.otherTeam) : null;
        const lenderOrg = input.as === "lender" ? me.orgId : otherOrg;
        const borrowerOrg = input.as === "borrower" ? me.orgId : otherOrg;
        const loan: Loan = {
            season,
            eventCode,
            // A non-PRIDE lender has no org; "" keeps the field a string for queries.
            lenderOrg: lenderOrg ?? "",
            lenderTeam: input.as === "lender" ? Number(me.orgId) : input.otherTeam,
            borrowerOrg,
            borrowerTeam: input.as === "borrower" ? Number(me.orgId) : input.otherTeam,
            item,
            qty,
            giveaway: input.giveaway === true,
            status: input.giveaway ? "given" : "lent",
            parties: [lenderOrg, borrowerOrg].filter((o): o is string => !!o),
            lentAtMs: Date.now(),
        };

        const db = getAdminDb();
        const ref = db.collection("loans").doc();
        await db.runTransaction(async tx => {
            let reqRef = null;
            if (input.requestId && /^[A-Za-z0-9]{1,40}$/.test(input.requestId)) {
                reqRef = db.collection("lend_requests").doc(input.requestId);
                const req = await tx.get(reqRef);
                const data = req.data() as { orgId?: string; status?: string } | undefined;
                // Only the borrower's own open request is closed by this loan.
                if (!req.exists || data?.orgId !== borrowerOrg || data?.status !== "open") reqRef = null;
                else loan.requestId = input.requestId;
            }
            tx.set(ref, loan);
            if (reqRef) tx.update(reqRef, { status: "resolved", updatedAt: new Date() });
        });
        return { ok: true, loanId: ref.id };
    } catch (e) {
        console.error("[lending] record failed:", e);
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
}

/** "It came back": the borrower marks it, the lender confirms (or closes it directly). */
export async function markLoanReturnedAction(input: { idToken: string; loanId: string }): Promise<Result<{ status: Loan["status"] }>> {
    if (typeof input.loanId !== "string" || !/^[A-Za-z0-9]{1,40}$/.test(input.loanId)) return { ok: false, code: "lending.notFound" };
    const who = await callerWithTeam(input.idToken);
    if (!who.ok) return who;
    const me = who.caller;
    if (!(await allowUser("lending", me.uid, 30))) return { ok: false, code: "rateLimited" };

    const db = getAdminDb();
    const ref = db.collection("loans").doc(input.loanId);
    try {
        return await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (!snap.exists) return { ok: false as const, code: "lending.notFound" as ErrorCode };
            const loan = snap.data() as Loan;
            const role = loan.lenderOrg === me.orgId ? "lender" : loan.borrowerOrg === me.orgId ? "borrower" : null;
            if (!role) return { ok: false as const, code: "lending.notAllowed" as ErrorCode };
            // A loan with a single party (other team not on PRIDE) is closed by that party.
            const soleParty = loan.parties.length === 1;
            const next = soleParty && (loan.status === "lent" || loan.status === "return_marked")
                ? "returned"
                : nextLoanStatus(loan.status, role);
            if (!next) return { ok: false as const, code: "lending.badState" as ErrorCode };
            const now = Date.now();
            tx.update(ref, {
                status: next,
                ...(next === "return_marked" ? { returnMarkedAtMs: now } : {}),
                ...(next === "returned" ? { returnedAtMs: now } : {}),
            });
            return { ok: true as const, status: next };
        });
    } catch (e) {
        console.error("[lending] mark returned failed:", e);
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
}
