"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import clsx from "clsx";
import { doc, getDoc } from "firebase/firestore";
import { MapPin, Search, Plus, Trash2, Check, Hand } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { SCOUTING_EVENT_COOKIE } from "@/lib/scouting-event";
import { isValidTeamNumber } from "@/lib/input-guards";
import {
    INVENTORY_CATEGORIES, LIMITS, cleanText, isOpenLoan, itemsAtEvent, matchesQuery,
    type InventoryCategory, type InventoryItem, type EventPresence, type LendRequest, type Loan,
} from "@/lib/lending";
import {
    listenMyInventory, listenLendableItems, saveInventoryItem, deleteInventoryItem,
    listenPresence, checkIn, listenRequests, createRequest, setRequestStatus, listenMyLoans,
    type WithId,
} from "@/lib/lending-service";
import { recordLoanAction, markLoanReturnedAction, disputeLoanAction } from "@/app/actions/lending";

interface EventOption { code: string; name: string; dateStart: string }

export default function LendingClient({ season, eventCode, events }: { season: number; eventCode: string | null; events: EventOption[] }) {
    const t = useTranslations("Lending");
    const router = useRouter();
    const { user, orgId, loading } = useAuth();

    const changeEvent = (code: string) => {
        document.cookie = `${SCOUTING_EVENT_COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 120}; samesite=lax`;
        router.push(`/lending?event=${code}`);
    };

    return (
        <div className="space-y-5">
            <label className="block max-w-md">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("event")}</span>
                <select value={eventCode ?? ""} onChange={e => changeEvent(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    {events.map(ev => <option key={ev.code} value={ev.code}>{ev.dateStart.slice(0, 10)} · {ev.name} ({ev.code})</option>)}
                </select>
            </label>
            {loading ? null
                : !user ? <Notice>{t("signIn")}</Notice>
                : !orgId ? <Notice>{t("needTeam")}</Notice>
                : !eventCode ? <Notice>{t("noEvent")}</Notice>
                : <LendingBoard season={season} eventCode={eventCode} orgId={orgId} />}
        </div>
    );
}

function Notice({ children }: { children: React.ReactNode }) {
    return <p className="rounded-xl border border-border bg-muted p-6 text-muted-foreground">{children}</p>;
}

function LendingBoard({ season, eventCode, orgId }: { season: number; eventCode: string; orgId: string }) {
    const t = useTranslations("Lending");
    const [presence, setPresence] = useState<WithId<EventPresence>[]>([]);
    const [lendable, setLendable] = useState<WithId<InventoryItem>[]>([]);
    const [mine, setMine] = useState<WithId<InventoryItem>[]>([]);
    const [requests, setRequests] = useState<WithId<LendRequest>[]>([]);
    const [loans, setLoans] = useState<WithId<Loan>[]>([]);
    const [teamName, setTeamName] = useState("");
    // Pre-filled loan form (from "I have it" on a request or an item).
    const [loanDraft, setLoanDraft] = useState<{ as: "lender" | "borrower"; otherTeam: string; item: string; requestId?: string } | null>(null);

    useEffect(() => listenPresence(season, eventCode, setPresence), [season, eventCode]);
    useEffect(() => listenLendableItems(setLendable), []);
    useEffect(() => listenMyInventory(orgId, setMine), [orgId]);
    useEffect(() => listenRequests(season, eventCode, setRequests), [season, eventCode]);
    useEffect(() => listenMyLoans(orgId, setLoans), [orgId]);
    useEffect(() => {
        getDoc(doc(db, "orgs", orgId)).then(s => setTeamName((s.data()?.displayName as string) ?? "")).catch(() => {});
    }, [orgId]);

    const me = presence.find(p => p.orgId === orgId);
    const myTeam = Number(orgId);
    const openLoans = loans.filter(l => isOpenLoan(l));
    const eventLoans = loans.filter(l => l.eventCode === eventCode && l.season === season);

    return (
        <div className="space-y-5">
            <CheckIn season={season} eventCode={eventCode} orgId={orgId} teamNumber={myTeam} teamName={teamName} current={me} />

            {openLoans.length > 0 && (
                <p className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-sm font-semibold">
                    {t("openLoans", { n: openLoans.length })}
                </p>
            )}

            <Tabs key={loanDraft ? "loan" : "find"} defaultValue={loanDraft ? "loans" : "find"} className="space-y-4">
                <TabsList className="flex w-full flex-wrap gap-1 border border-border bg-muted p-1 md:w-fit">
                    <TabsTrigger value="find">{t("tabFind")}</TabsTrigger>
                    <TabsTrigger value="requests">{t("tabRequests", { n: requests.filter(r => r.status === "open").length })}</TabsTrigger>
                    <TabsTrigger value="inventory">{t("tabInventory")}</TabsTrigger>
                    <TabsTrigger value="loans">{t("tabLoans", { n: eventLoans.filter(l => isOpenLoan(l)).length })}</TabsTrigger>
                </TabsList>

                <TabsContent value="find">
                    <FindTab lendable={lendable} presence={presence} orgId={orgId}
                        onBorrow={(team, item) => setLoanDraft({ as: "borrower", otherTeam: String(team), item })} />
                </TabsContent>
                <TabsContent value="requests">
                    <RequestsTab season={season} eventCode={eventCode} orgId={orgId} me={me} requests={requests} mine={mine}
                        onLend={(r) => setLoanDraft({ as: "lender", otherTeam: String(r.teamNumber), item: r.item, requestId: r.id })} />
                </TabsContent>
                <TabsContent value="inventory">
                    <InventoryTab orgId={orgId} teamNumber={myTeam} items={mine} />
                </TabsContent>
                <TabsContent value="loans">
                    <LoansTab season={season} eventCode={eventCode} orgId={orgId} loans={loans} draft={loanDraft} onDone={() => setLoanDraft(null)} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function CheckIn({ season, eventCode, orgId, teamNumber, teamName, current }: {
    season: number; eventCode: string; orgId: string; teamNumber: number; teamName: string; current?: EventPresence;
}) {
    const t = useTranslations("Lending");
    const [editing, setEditing] = useState(false);
    const [pit, setPit] = useState(current?.pit ?? "");
    const save = async () => {
        try {
            await checkIn({ season, eventCode, orgId, teamNumber, teamName: cleanText(teamName, 80), pit: cleanText(pit, LIMITS.pit) });
            setEditing(false);
            toast.success(t("checkedIn"));
        } catch {
            toast.error(t("saveError"));
        }
    };
    if (current && !editing) {
        return (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
                <span className="flex items-center gap-2 text-sm"><MapPin size={16} className="text-primary" />
                    {t("hereAt", { event: eventCode, pit: current.pit || "—" })}</span>
                <button type="button" onClick={() => { setPit(current.pit); setEditing(true); }} className="min-h-[40px] rounded-lg border border-border px-3 text-sm">{t("changePit")}</button>
            </div>
        );
    }
    return (
        <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm">{t("checkInPrompt", { event: eventCode })}</p>
            <div className="flex gap-2">
                <input value={pit} onChange={e => setPit(e.target.value)} maxLength={LIMITS.pit} placeholder={t("pitPlaceholder")}
                    className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm" aria-label={t("pitPlaceholder")} />
                <button type="button" onClick={save} className="min-h-[40px] rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground">{t("checkIn")}</button>
            </div>
        </div>
    );
}

function FindTab({ lendable, presence, orgId, onBorrow }: {
    lendable: WithId<InventoryItem>[]; presence: EventPresence[]; orgId: string; onBorrow: (team: number, item: string) => void;
}) {
    const t = useTranslations("Lending");
    const [q, setQ] = useState("");
    const rows = useMemo(() => itemsAtEvent(lendable, presence, q, orgId), [lendable, presence, q, orgId]);
    return (
        <div className="space-y-3">
            <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("searchPlaceholder")}
                    className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm" />
            </div>
            <p className="text-xs text-muted-foreground">{t("findHint", { teams: presence.length })}</p>
            {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("noItems")}</p> : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                    {rows.map(({ item, presence: p }, i) => (
                        <li key={`${item.orgId}_${item.name}_${i}`} className="flex flex-wrap items-center justify-between gap-2 p-3">
                            <div>
                                <div className="font-semibold">{item.name} <span className="text-xs text-muted-foreground">×{item.qty}</span>
                                    {item.giveaway && <span className="ml-2 rounded bg-success/15 px-1.5 text-[11px] text-success">{t("giveaway")}</span>}</div>
                                <div className="text-xs text-muted-foreground">{t("teamPit", { team: p.teamNumber, name: p.teamName, pit: p.pit || "—" })}</div>
                            </div>
                            <button type="button" onClick={() => onBorrow(p.teamNumber, item.name)} className="min-h-[40px] rounded-lg border border-border px-3 text-sm">{t("theyLentMe")}</button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function RequestsTab({ season, eventCode, orgId, me, requests, mine, onLend }: {
    season: number; eventCode: string; orgId: string; me?: EventPresence; requests: WithId<LendRequest>[];
    mine: InventoryItem[]; onLend: (r: WithId<LendRequest>) => void;
}) {
    const t = useTranslations("Lending");
    const format = useFormatter();
    const [item, setItem] = useState("");
    const [note, setNote] = useState("");
    const open = requests.filter(r => r.status === "open").sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));

    const post = async () => {
        if (!me) { toast.error(t("checkInFirst")); return; }
        const clean = cleanText(item, LIMITS.name);
        if (!clean) return;
        try {
            await createRequest({ season, eventCode, orgId, teamNumber: me.teamNumber, pit: me.pit, item: clean, note: cleanText(note, LIMITS.note) });
            setItem(""); setNote("");
            toast.success(t("requestPosted"));
        } catch {
            toast.error(t("saveError"));
        }
    };

    return (
        <div className="space-y-4">
            <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                <h3 className="text-sm font-bold">{t("needSomething")}</h3>
                <input value={item} onChange={e => setItem(e.target.value)} maxLength={LIMITS.name} placeholder={t("itemPlaceholder")}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" aria-label={t("itemPlaceholder")} />
                <input value={note} onChange={e => setNote(e.target.value)} maxLength={LIMITS.note} placeholder={t("notePlaceholder")}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" aria-label={t("notePlaceholder")} />
                <button type="button" onClick={post} className="min-h-[40px] rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground">{t("postRequest")}</button>
            </div>
            {open.length === 0 ? <p className="text-sm text-muted-foreground">{t("noRequests")}</p> : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                    {open.map(r => {
                        const own = r.orgId === orgId;
                        const haveIt = !own && mine.some(i => i.qty > 0 && matchesQuery(i.name, r.item));
                        return (
                            <li key={r.id} className={clsx("flex flex-wrap items-center justify-between gap-2 p-3", haveIt && "bg-success/5")}>
                                <div className="min-w-0">
                                    <div className="font-semibold">{r.item}</div>
                                    {r.note && <div className="text-sm text-muted-foreground">{r.note}</div>}
                                    <div className="text-xs text-muted-foreground">
                                        {t("teamPit", { team: r.teamNumber, name: "", pit: r.pit || "—" })}
                                        {r.createdAt?.seconds ? ` · ${format.relativeTime(new Date(r.createdAt.seconds * 1000))}` : ""}
                                        {haveIt && <span className="ml-2 font-semibold text-success">{t("youHaveIt")}</span>}
                                    </div>
                                </div>
                                {own ? (
                                    <div className="flex gap-1">
                                        <button type="button" onClick={() => setRequestStatus(r.id, "resolved")} className="min-h-[40px] rounded-lg border border-border px-3 text-sm">{t("gotIt")}</button>
                                        <button type="button" onClick={() => setRequestStatus(r.id, "cancelled")} className="min-h-[40px] rounded-lg border border-border px-3 text-sm text-muted-foreground">{t("cancel")}</button>
                                    </div>
                                ) : (
                                    <button type="button" onClick={() => onLend(r)} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground"><Hand size={14} /> {t("iLendIt")}</button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

function InventoryTab({ orgId, teamNumber, items }: { orgId: string; teamNumber: number; items: WithId<InventoryItem>[] }) {
    const t = useTranslations("Lending");
    const [name, setName] = useState("");
    const [category, setCategory] = useState<InventoryCategory>("part");
    const [qty, setQty] = useState(1);
    const add = async () => {
        const clean = cleanText(name, LIMITS.name);
        if (!clean) return;
        try {
            await saveInventoryItem(orgId, null, { teamNumber, name: clean, category, qty: Math.max(0, Math.min(LIMITS.qtyMax, Math.trunc(qty) || 0)), lendable: true, giveaway: category === "consumable" });
            setName(""); setQty(1);
        } catch {
            toast.error(t("saveError"));
        }
    };
    const update = (it: WithId<InventoryItem>, patch: Partial<InventoryItem>) =>
        saveInventoryItem(orgId, it.id, { teamNumber, name: it.name, category: it.category, qty: it.qty, lendable: it.lendable, giveaway: it.giveaway, ...patch })
            .catch(() => toast.error(t("saveError")));

    return (
        <div className="space-y-4">
            <p className="text-xs text-muted-foreground">{t("inventoryHint")}</p>
            <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-3">
                <input value={name} onChange={e => setName(e.target.value)} maxLength={LIMITS.name} placeholder={t("itemPlaceholder")}
                    className="min-w-[12rem] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" aria-label={t("itemPlaceholder")} />
                <select value={category} onChange={e => setCategory(e.target.value as InventoryCategory)} className="rounded-lg border border-border bg-background px-2 text-sm" aria-label={t("category")}>
                    {INVENTORY_CATEGORIES.map(c => <option key={c} value={c}>{t(`categories.${c}`)}</option>)}
                </select>
                <input type="number" min={0} max={LIMITS.qtyMax} value={qty} onChange={e => setQty(Number(e.target.value))}
                    className="w-20 rounded-lg border border-border bg-background px-2 text-sm" aria-label={t("qty")} />
                <button type="button" onClick={add} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground"><Plus size={14} /> {t("add")}</button>
            </div>
            {items.length === 0 ? <p className="text-sm text-muted-foreground">{t("emptyInventory")}</p> : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                    {[...items].sort((a, b) => a.name.localeCompare(b.name)).map(it => (
                        <li key={it.id} className="flex flex-wrap items-center gap-3 p-3">
                            <div className="min-w-0 flex-1">
                                <div className="font-semibold">{it.name}</div>
                                <div className="text-xs text-muted-foreground">{t(`categories.${it.category}`)}</div>
                            </div>
                            <input type="number" min={0} max={LIMITS.qtyMax} defaultValue={it.qty} aria-label={t("qty")}
                                onBlur={e => { const v = Math.max(0, Math.min(LIMITS.qtyMax, Math.trunc(Number(e.target.value)) || 0)); if (v !== it.qty) update(it, { qty: v }); }}
                                className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm" />
                            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={it.lendable} onChange={e => update(it, { lendable: e.target.checked })} /> {t("lendable")}</label>
                            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={it.giveaway} onChange={e => update(it, { giveaway: e.target.checked })} /> {t("giveaway")}</label>
                            <button type="button" aria-label={t("delete")} onClick={() => deleteInventoryItem(it.id).catch(() => toast.error(t("saveError")))} className="min-h-[36px] rounded-md p-2 text-muted-foreground hover:text-danger"><Trash2 size={16} /></button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function LoansTab({ season, eventCode, orgId, loans, draft, onDone }: {
    season: number; eventCode: string; orgId: string; loans: WithId<Loan>[];
    draft: { as: "lender" | "borrower"; otherTeam: string; item: string; requestId?: string } | null; onDone: () => void;
}) {
    const t = useTranslations("Lending");
    const tErr = useTranslations("Errors");
    const format = useFormatter();
    const { user } = useAuth();
    const [as, setAs] = useState<"lender" | "borrower">(draft?.as ?? "lender");
    const [otherTeam, setOtherTeam] = useState(draft?.otherTeam ?? "");
    const [item, setItem] = useState(draft?.item ?? "");
    const [qty, setQty] = useState(1);
    const [giveaway, setGiveaway] = useState(false);
    const [busy, setBusy] = useState(false);

    const record = async () => {
        const team = Number(otherTeam);
        if (!user || !isValidTeamNumber(team) || !cleanText(item, LIMITS.name)) { toast.error(tErr("lending.itemRequired")); return; }
        setBusy(true);
        let r: Awaited<ReturnType<typeof recordLoanAction>>;
        try {
            r = await recordLoanAction({ idToken: await user.getIdToken(), season, eventCode, as, otherTeam: team, item, qty, giveaway, requestId: draft?.requestId });
        } catch {
            r = { ok: false, code: "generic" };
        } finally {
            setBusy(false);
        }
        if (!r.ok) { toast.error(tErr(r.code)); return; }
        toast.success(t("loanRecorded"));
        setOtherTeam(""); setItem(""); setQty(1); setGiveaway(false);
        onDone();
    };
    const markReturned = async (id: string) => {
        if (!user) return;
        try {
            const r = await markLoanReturnedAction({ idToken: await user.getIdToken(), loanId: id });
            if (!r.ok) toast.error(tErr(r.code));
        } catch {
            toast.error(tErr("generic"));
        }
    };
    const dispute = async (id: string) => {
        if (!user) return;
        try {
            const r = await disputeLoanAction({ idToken: await user.getIdToken(), loanId: id });
            if (!r.ok) toast.error(tErr(r.code));
        } catch {
            toast.error(tErr("generic"));
        }
    };

    const sorted = [...loans].sort((a, b) => Number(isOpenLoan(b)) - Number(isOpenLoan(a)) || b.lentAtMs - a.lentAtMs);

    return (
        <div className="space-y-4">
            <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                <h3 className="text-sm font-bold">{t("recordLoan")}</h3>
                <div role="radiogroup" className="flex gap-1">
                    {(["lender", "borrower"] as const).map(v => (
                        <button key={v} type="button" role="radio" aria-checked={as === v} onClick={() => setAs(v)}
                            className={clsx("min-h-[40px] flex-1 rounded-lg border px-3 text-sm font-semibold", as === v ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                            {t(v === "lender" ? "iLent" : "iBorrowed")}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2">
                    <input inputMode="numeric" value={otherTeam} onChange={e => setOtherTeam(e.target.value.replace(/\D/g, "").slice(0, 5))}
                        placeholder={t(as === "lender" ? "toTeam" : "fromTeam")} aria-label={t(as === "lender" ? "toTeam" : "fromTeam")}
                        className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    <input value={item} onChange={e => setItem(e.target.value)} maxLength={LIMITS.name} placeholder={t("itemPlaceholder")} aria-label={t("itemPlaceholder")}
                        className="min-w-[12rem] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    <input type="number" min={1} max={LIMITS.qtyMax} value={qty} onChange={e => setQty(Number(e.target.value))} aria-label={t("qty")}
                        className="w-20 rounded-lg border border-border bg-background px-2 text-sm" />
                    <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={giveaway} onChange={e => setGiveaway(e.target.checked)} /> {t("giveawayNoReturn")}</label>
                </div>
                <button type="button" disabled={busy} onClick={record} className="min-h-[40px] rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">{t("save")}</button>
            </div>

            {sorted.length === 0 ? <p className="text-sm text-muted-foreground">{t("noLoans")}</p> : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                    {sorted.map(l => {
                        const iAmLender = l.lenderOrg === orgId;
                        const other = iAmLender ? l.borrowerTeam : l.lenderTeam;
                        const canAct = isOpenLoan(l) && !(l.status === "return_marked" && !iAmLender && l.parties.length > 1);
                        return (
                            <li key={l.id} className={clsx("flex flex-wrap items-center justify-between gap-2 p-3", isOpenLoan(l) && "bg-warning/5")}>
                                <div className="min-w-0">
                                    <div className="font-semibold">{l.item} <span className="text-xs text-muted-foreground">×{l.qty}</span></div>
                                    <div className="text-xs text-muted-foreground">
                                        {t(iAmLender ? "lentTo" : "borrowedFrom", { team: other })} · {l.eventCode} · {format.relativeTime(new Date(l.lentAtMs))}
                                    </div>
                                    <div className="text-xs font-semibold">{t(`status.${l.status}`)}</div>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {canAct && (
                                        <button type="button" onClick={() => markReturned(l.id)} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-border px-3 text-sm">
                                            <Check size={14} /> {t(iAmLender ? "confirmReturned" : "markReturned")}
                                        </button>
                                    )}
                                    {l.status === "lent" && l.createdByOrg !== orgId && l.parties.length > 1 && (
                                        <button type="button" onClick={() => dispute(l.id)} className="min-h-[40px] rounded-lg border border-border px-3 text-sm text-muted-foreground">
                                            {t("dispute")}
                                        </button>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
