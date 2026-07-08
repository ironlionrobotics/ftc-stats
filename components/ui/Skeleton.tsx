import clsx from "clsx";

/**
 * Skeleton placeholder for loading states.
 *
 * Replaces spinner-only loading indicators (which leave the user staring at a
 * blank page wondering if anything is happening) with sized rectangles that
 * preview the upcoming layout. Reduces perceived latency materially on slow
 * connections like venue Wi-Fi.
 *
 * Use:
 *   <Skeleton className="h-4 w-32" />
 *   <Skeleton className="h-32 w-full rounded-xl" />
 *
 * Convention: pass real dimensions/border-radius via className so the
 * skeleton matches what's loading underneath.
 */
export function Skeleton({ className }: { className?: string }) {
    return (
        <div
            className={clsx(
                "animate-pulse rounded bg-white/5 dark:bg-white/10",
                className,
            )}
            aria-hidden="true"
        />
    );
}

/**
 * Pre-composed skeleton for a table row. Use inside a table body while data
 * loads to preserve column widths and prevent layout shift on hydration.
 */
export function SkeletonRow({ columns }: { columns: number }) {
    return (
        <tr>
            {Array.from({ length: columns }).map((_, i) => (
                <td key={i} className="px-3 py-3">
                    <Skeleton className="h-3 w-full max-w-[120px]" />
                </td>
            ))}
        </tr>
    );
}

/**
 * Pre-composed skeleton for a card-shaped item.
 */
export function SkeletonCard({ className }: { className?: string }) {
    return (
        <div
            className={clsx(
                "p-4 bg-white/[0.02] border border-white/10 rounded-xl space-y-3",
                className,
            )}
        >
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <div className="grid grid-cols-3 gap-2 pt-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
            </div>
        </div>
    );
}
