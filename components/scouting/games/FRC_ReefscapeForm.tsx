"use client";

import { useState } from "react";
import { ScoutTeam, FRCMatchScouting, MatchScouting, CURRENT_GAME_SCHEMA } from "@/types/scouting";
import { saveToLocal } from "@/lib/localDatabase";
import { useAuth } from "@/context/AuthContext";
import { useProgram } from "@/lib/stores/program-store";
import { DEFAULT_ORG_ID, scoutIdFromUser, scoutNameFromUser } from "@/lib/orgs";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Save, Plus, Trophy, Minus, QrCode } from "lucide-react";
import clsx from "clsx";
import { useTranslations } from "next-intl";

interface FRC_ReefscapeFormProps {
    team: ScoutTeam;
    eventCode: string;
    entries: MatchScouting[];
    onSaveSuccess: () => void;
}

interface CounterProps {
    label: string;
    value: number;
    setter: (v: number) => void;
    color?: string;
}

function Counter({ label, value, setter, color = "primary" }: CounterProps) {
    return (
        <div className="flex flex-col gap-1 items-center">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
            <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border border-border shadow-inner">
                <button onClick={() => setter(Math.max(0, value - 1))} className="p-2 sm:p-3 bg-muted rounded-lg hover:bg-border active:bg-border transition text-muted-foreground"><Minus size={14} /></button>
                <span className={clsx("text-xl font-black w-8 text-center", color === 'cyan' ? 'text-secondary' : 'text-foreground')}>{value}</span>
                <button onClick={() => setter(value + 1)} className="p-2 sm:p-3 bg-muted rounded-lg hover:bg-border active:bg-border transition text-muted-foreground"><Plus size={14} /></button>
            </div>
        </div>
    );
}

interface CheckboxProps {
    label: string;
    checked: boolean;
    setter: (v: boolean) => void;
}

function Checkbox({ label, checked, setter }: CheckboxProps) {
    return (
        <label className={clsx(
            "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group flex-1",
            checked ? "bg-secondary/20 border-secondary/50" : "bg-muted border-border hover:border-foreground/20"
        )}>
            <input type="checkbox" checked={checked} onChange={e => setter(e.target.checked)} className="w-4 h-4 accent-secondary" />
            <span className={clsx("text-sm font-medium transition", checked ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{label}</span>
        </label>
    );
}

export default function FRC_ReefscapeForm({ team, eventCode, entries, onSaveSuccess }: FRC_ReefscapeFormProps) {
    const t = useTranslations("FrcReefscape");
    const { user, orgId } = useAuth();
    const { season } = useProgram();
    const [isAdding, setIsAdding] = useState(false);

    // Form State for REEFSCAPE
    const [matchNum, setMatchNum] = useState<number>(1);

    // Auto
    const [autoLeave, setAutoLeave] = useState(false);
    const [autoCoralL1, setAutoCoralL1] = useState(0);
    const [autoCoralL2, setAutoCoralL2] = useState(0);
    const [autoCoralL3, setAutoCoralL3] = useState(0);
    const [autoCoralL4, setAutoCoralL4] = useState(0);
    const [autoAlgaeProcessor, setAutoAlgaeProcessor] = useState(0);
    const [autoAlgaeNet, setAutoAlgaeNet] = useState(0);

    // Teleop
    const [teleopCoralL1, setTeleopCoralL1] = useState(0);
    const [teleopCoralL2, setTeleopCoralL2] = useState(0);
    const [teleopCoralL3, setTeleopCoralL3] = useState(0);
    const [teleopCoralL4, setTeleopCoralL4] = useState(0);
    const [teleopAlgaeProcessor, setTeleopAlgaeProcessor] = useState(0);
    const [teleopAlgaeNet, setTeleopAlgaeNet] = useState(0);
    const [driverSkill, setDriverSkill] = useState(3);
    const [defenseRating, setDefenseRating] = useState(1);

    // Endgame
    const [endgameParked, setEndgameParked] = useState(false);
    const [endgameClimbState, setEndgameClimbState] = useState<'None' | 'Shallow' | 'Deep'>('None');

    const [notes, setNotes] = useState("");

    const handleSave = async () => {
        if (!user) {
            toast.error(t("signIn"));
            return;
        }

        const scoutId = scoutIdFromUser(user);
        const scoutName = scoutNameFromUser(user);
        const effectiveOrgId = orgId ?? DEFAULT_ORG_ID;

        const data: Omit<FRCMatchScouting, 'id'> = {
            teamNumber: team.teamNumber,
            eventCode,
            matchNumber: matchNum,
            season,
            program: 'FRC',

            // Federated attribution
            orgId: effectiveOrgId,
            scoutId,
            scoutName,
            // Legacy aliases kept populated until backfill of historical docs
            scouterId: scoutId,
            scouterName: scoutName,
            confidence: "high",
            gameSchemaVersion: CURRENT_GAME_SCHEMA.FRC,

            notes,
            timestamp: null,

            autoLeave,
            autoCoralL1,
            autoCoralL2,
            autoCoralL3,
            autoCoralL4,
            autoAlgaeProcessor,
            autoAlgaeNet,

            teleopCoralL1,
            teleopCoralL2,
            teleopCoralL3,
            teleopCoralL4,
            teleopAlgaeProcessor,
            teleopAlgaeNet,
            driverSkill,
            defenseRating,

            endgameParked,
            endgameClimbState,
        };

        // Offline storage
        await saveToLocal(data as FRCMatchScouting);

        setIsAdding(false);
        onSaveSuccess();

        // Reset
        setAutoCoralL1(0); setAutoCoralL2(0); setAutoCoralL3(0); setAutoCoralL4(0);
        setAutoAlgaeProcessor(0); setAutoAlgaeNet(0);
        setTeleopCoralL1(0); setTeleopCoralL2(0); setTeleopCoralL3(0); setTeleopCoralL4(0);
        setTeleopAlgaeProcessor(0); setTeleopAlgaeNet(0);
        setNotes("");
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-secondary/10 p-4 rounded-2xl border border-secondary/20">
                <div className="flex flex-col">
                    <h3 className="text-xl font-black text-secondary flex items-center gap-2">
                        <Trophy size={20} /> {t("title")}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">{t("season")}</p>
                </div>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className={clsx(
                        "flex items-center gap-2 px-6 py-2 rounded-xl font-bold transition shadow-lg",
                        isAdding ? "bg-danger/20 text-danger border border-danger/30" : "bg-secondary text-secondary-foreground hover:bg-secondary/90"
                    )}
                >
                    {isAdding ? t("cancel") : <><Plus size={18} /> {t("newRecord")}</>}
                </button>
            </div>

            {isAdding && (
                <Card className="p-6 bg-card border-secondary/20 shadow-sm animate-in slide-in-from-top-4">
                    <div className="flex flex-col gap-8">
                        {/* Upper Section */}
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="md:w-1/4">
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">{t("matchNumber")}</label>
                                <input
                                    type="number"
                                    value={matchNum}
                                    onChange={e => setMatchNum(Number(e.target.value))}
                                    className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-foreground font-black text-2xl focus:ring-2 focus:ring-secondary outline-none transition"
                                />
                            </div>
                            <div className="md:w-3/4 flex flex-col justify-end">
                                <Checkbox label={t("autoLeave")} checked={autoLeave} setter={setAutoLeave} />
                            </div>
                        </div>

                        {/* Middle Section: Auto vs Teleop */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-border pt-8">
                            {/* Auto Grid */}
                            <div className="space-y-6">
                                <h4 className="text-sm font-black text-secondary uppercase tracking-widest flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-secondary" /> {t("auto")}</h4>
                                <div className="space-y-4 bg-muted p-4 rounded-2xl border border-border">
                                    <div className="text-center text-xs font-bold text-muted-foreground uppercase">{t("coralAuto")}</div>
                                    <div className="grid grid-cols-4 gap-2">
                                        <Counter label="L1" value={autoCoralL1} setter={setAutoCoralL1} color="cyan" />
                                        <Counter label="L2" value={autoCoralL2} setter={setAutoCoralL2} color="cyan" />
                                        <Counter label="L3" value={autoCoralL3} setter={setAutoCoralL3} color="cyan" />
                                        <Counter label="L4" value={autoCoralL4} setter={setAutoCoralL4} color="cyan" />
                                    </div>
                                    <div className="border-t border-border pt-4 grid grid-cols-2 gap-2">
                                        <Counter label={t("processor")} value={autoAlgaeProcessor} setter={setAutoAlgaeProcessor} color="primary" />
                                        <Counter label="Net" value={autoAlgaeNet} setter={setAutoAlgaeNet} color="primary" />
                                    </div>
                                </div>
                            </div>

                            {/* Teleop Grid */}
                            <div className="space-y-6">
                                <h4 className="text-sm font-black text-secondary uppercase tracking-widest flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-secondary" /> TeleOp</h4>
                                <div className="space-y-4 bg-muted p-4 rounded-2xl border border-border">
                                    <div className="text-center text-xs font-bold text-muted-foreground uppercase">{t("coralTele")}</div>
                                    <div className="grid grid-cols-4 gap-2">
                                        <Counter label="L1" value={teleopCoralL1} setter={setTeleopCoralL1} color="cyan" />
                                        <Counter label="L2" value={teleopCoralL2} setter={setTeleopCoralL2} color="cyan" />
                                        <Counter label="L3" value={teleopCoralL3} setter={setTeleopCoralL3} color="cyan" />
                                        <Counter label="L4" value={teleopCoralL4} setter={setTeleopCoralL4} color="cyan" />
                                    </div>
                                    <div className="border-t border-border pt-4 grid grid-cols-2 gap-2">
                                        <Counter label={t("processor")} value={teleopAlgaeProcessor} setter={setTeleopAlgaeProcessor} color="primary" />
                                        <Counter label="Net" value={teleopAlgaeNet} setter={setTeleopAlgaeNet} color="primary" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Lower Section: Attributes & Endgame */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-border pt-8">
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">{t("driverSkill")}</label>
                                    <div className="flex gap-2">
                                        {[1, 2, 3, 4, 5].map(s => (
                                            <button
                                                key={`drive-${s}`}
                                                onClick={() => setDriverSkill(s)}
                                                className={clsx("flex-1 py-3 rounded-xl font-black transition", driverSkill === s ? "bg-secondary text-secondary-foreground shadow-lg" : "bg-muted text-muted-foreground hover:bg-border")}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">{t("defenseRating")}</label>
                                    <div className="flex gap-2">
                                        {[1, 2, 3, 4, 5].map(s => (
                                            <button
                                                key={`def-${s}`}
                                                onClick={() => setDefenseRating(s)}
                                                className={clsx("flex-1 py-3 rounded-xl font-black transition", defenseRating === s ? "bg-danger text-white shadow-lg" : "bg-muted text-muted-foreground hover:bg-border")}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">{t("defenseScale")}</p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <h4 className="text-sm font-black text-secondary uppercase tracking-widest">Endgame</h4>
                                <div className="space-y-4">
                                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest">{t("climbState")}</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['None', 'Shallow', 'Deep'] as const).map(c => (
                                            <button
                                                key={c}
                                                onClick={() => setEndgameClimbState(c)}
                                                className={clsx("py-3 rounded-xl font-black transition border", endgameClimbState === c ? "bg-warning text-white border-warning" : "bg-muted border-border text-muted-foreground hover:bg-border")}
                                            >
                                                {c.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                    <Checkbox label={t("parked")} checked={endgameParked} setter={setEndgameParked} />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">{t("notes")}</label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                className="w-full h-32 px-4 py-3 bg-muted border border-border rounded-xl text-foreground focus:ring-2 focus:ring-secondary outline-none transition"
                                placeholder={t("notesPh")}
                            />
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-border sticky bottom-0 bg-card/90 p-4 -mx-6 -mb-6 rounded-b-2xl z-20 flex flex-col gap-3">
                        <button
                            onClick={handleSave}
                            className="w-full py-4 bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-xl font-black flex items-center justify-center gap-3 transition text-lg"
                        >
                            <Save size={22} />
                            {t("saveLocal")}
                        </button>
                        <p className="text-center font-bold text-xs text-warning flex items-center justify-center gap-1.5 opacity-80">
                            <QrCode size={14} /> {t("localHint")}
                        </p>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 gap-4">
                {entries.length === 0 ? (
                    <div className="text-center py-24 bg-muted rounded-2xl border border-border text-muted-foreground italic">
                        {t("empty")}
                    </div>
                ) : (
                    entries.sort((a, b) => b.matchNumber - a.matchNumber).map((item, idx) => {
                        const entry = item as FRCMatchScouting;
                        return (
                            <div key={idx} className="bg-muted border border-border rounded-2xl p-6 flex flex-col md:flex-row gap-6">
                                <div className="font-black text-2xl text-secondary w-16">
                                    Q{entry.matchNumber}
                                </div>
                                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-bold">
                                    <div className="bg-muted p-3 rounded-xl border border-border">
                                        <div className="text-muted-foreground uppercase tracking-widest text-xs mb-1">{t("totalAutoCoral")}</div>
                                        <div className="text-lg text-foreground">{(entry.autoCoralL1 ?? 0) + (entry.autoCoralL2 ?? 0) + (entry.autoCoralL3 ?? 0) + (entry.autoCoralL4 ?? 0)}</div>
                                    </div>
                                    <div className="bg-muted p-3 rounded-xl border border-border">
                                        <div className="text-muted-foreground uppercase tracking-widest text-xs mb-1">{t("totalTeleCoral")}</div>
                                        <div className="text-lg text-foreground">{(entry.teleopCoralL1 ?? 0) + (entry.teleopCoralL2 ?? 0) + (entry.teleopCoralL3 ?? 0) + (entry.teleopCoralL4 ?? 0)}</div>
                                    </div>
                                    <div className="bg-muted p-3 rounded-xl border border-border">
                                        <div className="text-muted-foreground uppercase tracking-widest text-xs mb-1">{t("climb")}</div>
                                        <div className={clsx("text-lg", (entry.endgameClimbState ?? 'None') === 'None' ? "text-muted-foreground" : "text-warning")}>
                                            {entry.endgameClimbState ?? 'None'}
                                        </div>
                                    </div>
                                    <div className="bg-muted p-3 rounded-xl border border-border flex flex-col justify-center">
                                        <div className="text-muted-foreground uppercase tracking-widest text-xs mb-1">{t("driver")}</div>
                                        <div className="text-lg text-success">{entry.driverSkill ?? '—'} / 5</div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
