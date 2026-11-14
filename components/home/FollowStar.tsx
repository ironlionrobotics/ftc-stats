"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { toggleFollowAction } from "@/app/actions/following";
import { mirrorFollows } from "@/lib/follows-sync";
import { MAX_FOLLOWS } from "@/lib/follows";
import { useAuth } from "@/context/AuthContext";

/** Follow / unfollow an event or team (decision #110). */
export default function FollowStar({ kind, value, following, label }: { kind: "event" | "team"; value: string | number; following: boolean; label: string }) {
    const t = useTranslations("Following");
    const router = useRouter();
    const { user } = useAuth();
    const [pending, start] = useTransition();
    const onClick = () => start(async () => {
        const res = await toggleFollowAction(kind, value);
        if (!res.ok) return;
        if (res.capped) { toast.error(t("capped", { max: MAX_FOLLOWS })); return; }
        if (user) void mirrorFollows(user.uid, res.follows);
        router.refresh();
    });
    return (
        <button type="button" onClick={onClick} disabled={pending} aria-pressed={following}
            aria-label={following ? t("unfollow", { name: label }) : t("follow", { name: label })}
            className={clsx("inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border transition-colors disabled:opacity-60",
                following ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            <Star size={18} className={following ? "fill-current" : ""} aria-hidden />
        </button>
    );
}
