"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { useProgram } from "@/lib/stores/program-store";
import {
    validateGroundTruthAction,
    fetchOrgReliabilityAction,
} from "@/app/actions/validate-ground-truth";
import { toErrorCode, type ErrorCode } from "@/lib/errors";
import { ShieldCheck, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import clsx from "clsx";

/**
 * Admin/lead-only panel for triggering ground-truth validation against the
 * FTC API. Lives in the sidebar, alongside InviteGenerator. Validation runs
 * for an event code the user types in; the resulting per-scout reliability
 * deltas are displayed inline.
 *
 * The button is intentionally manual rather than auto-running on a cron —
 * validation depends on the FTC API having posted final scores for the matches
 * we care about, which doesn't happen instantly during a live event. Letting
 * the admin pick the moment also avoids burning Firestore writes hammering
 * unfinished data.
 */
export default function GroundTruthValidator() {
    const { user, userDoc, orgId } = useAuth();
    const { season } = useProgram();
    const tErr = useTranslations("Errors");

    const [eventCode, setEventCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [report, setReport] = useState<null | {
        eligibleMatches: number;
        coveredMatches: number;
        scoutsUpdated: number;
        ranAt: string;
    }>(null);
    const [scouts, setScouts] = useState<Array<{
        scoutId: string;
        displayName: string;
        reliability: number;
        matchesScouted: number;
    }>>([]);
    // Errors are held as codes, not prose: the producer (validateGroundTruthAction)
    // has no locale, so translation happens at render (OnboardingModal pattern).
    const [error, setError] = useState<ErrorCode | null>(null);

    if (!user || !userDoc || !orgId) return null;
    const canRun = userDoc.role === "admin" || userDoc.role === "lead";
    if (!canRun) return null;

    const runValidation = async () => {
        setError(null);
        if (!eventCode.trim()) {
            setError("validation.eventCode");
            return;
        }
        setBusy(true);
        try {
            const idToken = await user.getIdToken();
            const result = await validateGroundTruthAction({
                idToken,
                season,
                eventCode: eventCode.trim().toUpperCase(),
            });
            if (!result.ok) {
                setError(result.code);
                return;
            }
            setReport({
                eligibleMatches: result.report.eligibleMatches,
                coveredMatches: result.report.coveredMatches,
                scoutsUpdated: result.report.scoutsUpdated,
                ranAt: result.report.ranAt,
            });

            // Refresh the per-scout reliability list to reflect the update.
            const scoutsResult = await fetchOrgReliabilityAction({ idToken });
            if (scoutsResult.ok) {
                setScouts(
                    scoutsResult.scouts.sort((a, b) => a.reliability - b.reliability),
                );
            }
        } catch (e) {
            setError(toErrorCode(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-lg border border-border bg-muted p-3 space-y-2">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                <ShieldCheck size={11} />
                Validación ground-truth
            </div>

            <p className="text-[10px] text-muted-foreground leading-relaxed">
                Compara scouting capturado vs scores oficiales y actualiza la
                confiabilidad de cada scout.
            </p>

            <div className="flex gap-1">
                <input
                    value={eventCode}
                    onChange={e => setEventCode(e.target.value.toUpperCase())}
                    placeholder="MXTOL"
                    className="flex-1 px-2 py-1.5 bg-muted border border-border rounded text-foreground text-xs font-mono uppercase"
                />
                <button
                    onClick={runValidation}
                    disabled={busy}
                    className="px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-bold rounded flex items-center gap-1"
                >
                    {busy ? <Loader2 size={11} className="animate-spin" /> : "Validar"}
                </button>
            </div>

            {error && (
                <div className="flex items-start gap-1.5 text-[10px] text-danger">
                    <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
                    <span>{tErr(error)}</span>
                </div>
            )}

            {report && (
                <div className="space-y-1.5 pt-1 border-t border-border">
                    <div className="flex items-center gap-1.5 text-[10px] text-success">
                        <CheckCircle2 size={11} />
                        <span>
                            {report.coveredMatches}/{report.eligibleMatches} matches con cobertura
                            · {report.scoutsUpdated} scouts actualizados
                        </span>
                    </div>
                    <div className="text-[9px] text-muted-foreground">
                        {new Date(report.ranAt).toLocaleString()}
                    </div>
                </div>
            )}

            {scouts.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-border">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
                        Confiabilidad scouts
                    </div>
                    <ul className="space-y-0.5">
                        {scouts.map(s => (
                            <li
                                key={s.scoutId}
                                className="flex items-center justify-between text-[10px]"
                            >
                                <span className="truncate text-muted-foreground">
                                    {s.displayName}
                                </span>
                                <span
                                    className={clsx(
                                        "font-mono font-bold ml-2",
                                        s.reliability > 0.8
                                            ? "text-success"
                                            : s.reliability > 0.5
                                                ? "text-warning"
                                                : "text-danger",
                                    )}
                                >
                                    {(s.reliability * 100).toFixed(0)}%
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
