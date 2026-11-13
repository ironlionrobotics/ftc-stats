import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

/**
 * Global route-loading skeleton. Next.js shows this while a route segment
 * suspends (server fetches, dynamic imports, etc.). The shape mirrors the
 * common page header + content layout to reduce perceived shift.
 */
export default function Loading() {
    return (
        <div className="container mx-auto px-4 py-8 space-y-6">
            <div className="space-y-2">
                <Skeleton className="h-10 w-72" />
                <Skeleton className="h-4 w-96" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
            </div>
            <SkeletonCard className="min-h-[300px]" />
        </div>
    );
}
