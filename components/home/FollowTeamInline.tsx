"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { toggleFollowAction } from "@/app/actions/following";
import { mirrorFollows } from "@/lib/follows-sync";
import { syncPushFollows } from "@/lib/push-client";
import { MAX_FOLLOWS } from "@/lib/follows";
import { isValidTeamNumber } from "@/lib/input-guards";
import { useAuth } from "@/context/AuthContext";

/** "Follow another team" by number (decision #110); unfollowing is the star on its card. */
export default function FollowTeamInline() {
    const t = useTranslations("Following");
    const router = useRouter();
    const { user } = useAuth();
    const [value, setValue] = useState("");
    const [pending, start] = useTransition();
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const n = Number(value.trim());
        if (!isValidTeamNumber(n)) { toast.error(t("badTeam")); return; }
        start(async () => {
            const res = await toggleFollowAction("team", n);
            if (res.capped) { toast.error(t("capped", { max: MAX_FOLLOWS })); return; }
            if (user) void mirrorFollows(user.uid, res.follows);
        void syncPushFollows();
            setValue("");
            router.refresh();
        });
    };
    return (
        <form onSubmit={submit} className="flex items-center gap-2">
            <label htmlFor="follow-team-n" className="text-sm text-muted-foreground">{t("followTeam")}</label>
            <input id="follow-team-n" inputMode="numeric" value={value} onChange={e => setValue(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="12345" className="min-h-[40px] w-24 rounded-lg border border-border bg-card px-3 font-mono text-sm" />
            <button type="submit" disabled={pending || !value} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-border px-3 text-sm disabled:opacity-50">
                <Plus size={16} aria-hidden /> {t("add")}
            </button>
        </form>
    );
}
