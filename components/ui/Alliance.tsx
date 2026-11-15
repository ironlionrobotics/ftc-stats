import clsx from "clsx";
import { TeamLink } from "./TeamLink";

/**
 * Alliance primitives (decision #116). Red and blue mean ONLY an alliance:
 * always with the word (ROJO/AZUL) and red on the left, so color is never the
 * only cue (red vs blue are ~1.2:1 in luminance). The followed team is marked
 * with the gold "you" dot. Server-safe (no hooks).
 */
export function AllianceSides({ red, blue, me, event, labels, className }: {
    red: number[];
    blue: number[];
    me?: number | null;
    event?: string | null;
    labels: { red: string; blue: string };
    className?: string;
}) {
    return (
        <div className={clsx("grid grid-cols-2 gap-2", className)}>
            <Side color="red" teams={red} me={me} event={event} label={labels.red} />
            <Side color="blue" teams={blue} me={me} event={event} label={labels.blue} />
        </div>
    );
}

function Side({ color, teams, me, event, label }: { color: "red" | "blue"; teams: number[]; me?: number | null; event?: string | null; label: string }) {
    const red = color === "red";
    return (
        <div className={clsx(
            "grid content-start gap-1 rounded-xl px-3 py-2",
            red ? "bg-alliance-red-tint shadow-[inset_3px_0_0_var(--color-alliance-red)]" : "bg-alliance-blue-tint text-right shadow-[inset_-3px_0_0_var(--color-alliance-blue)]",
        )}>
            <span className={clsx("text-xs font-extrabold tracking-[0.08em]", red ? "text-alliance-red" : "text-alliance-blue")}>{label}</span>
            {teams.length === 0 && <span className="text-base font-bold text-muted-foreground">—</span>}
            {teams.map(n => (
                <span key={n} className={clsx("flex items-center gap-1.5 text-base font-bold text-foreground", !red && "justify-end")}>
                    {n === me && red && <MeDot />}
                    <TeamLink team={n} event={event} underline={false} className="inline-flex min-h-8 items-center hover:underline" />
                    {n === me && !red && <MeDot />}
                </span>
            ))}
        </div>
    );
}

function MeDot() {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-brand ring-2 ring-card" aria-hidden />;
}

/**
 * Two-sided probability bar with alliance fills and the percentages written
 * out (the numbers carry the meaning; the bar is the glance).
 */
export function ProbabilityBar({ pRed, labels, format }: {
    pRed: number;
    labels: { red: string; blue: string };
    format: (p: number) => string;
}) {
    const r = Math.max(0, Math.min(1, pRed));
    return (
        <div>
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                <span className="block bg-alliance-red-fill" style={{ width: `${r * 100}%` }} />
                <span className="block flex-1 bg-alliance-blue-fill" />
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span><b className="font-mono text-sm text-foreground tabular-nums">{format(r)}</b> {labels.red}</span>
                <span>{labels.blue} <b className="font-mono text-sm text-foreground tabular-nums">{format(1 - r)}</b></span>
            </div>
        </div>
    );
}
