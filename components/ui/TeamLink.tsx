import Link from "next/link";
import clsx from "clsx";

/**
 * Every team number is a way to that team (decision #116): opens /team/N,
 * carrying the event so the profile can come back to it.
 */
export function TeamLink({ team, event, className, children, underline = true }: { team: number; event?: string | null; className?: string; children?: React.ReactNode; underline?: boolean }) {
    const href = event ? `/team/${team}?event=${encodeURIComponent(event)}` : `/team/${team}`;
    return (
        <Link href={href} className={clsx("font-mono tabular-nums", underline && "underline decoration-current/30 underline-offset-[3px] hover:decoration-current", className)}>
            {children ?? team}
        </Link>
    );
}
