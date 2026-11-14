"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { setFollowedTeamAction } from "@/app/actions/follow-team";
import { syncPushFollows } from "@/lib/push-client";

/** Inline "follow your team" form for the Today page (no account needed). */
export default function FollowTeamForm() {
    const t = useTranslations("TodayPage");
    const router = useRouter();
    const [value, setValue] = useState("");
    const [invalid, setInvalid] = useState(false);
    const [pending, startTransition] = useTransition();
    return (
        <form
            className="flex flex-wrap gap-2"
            onSubmit={e => {
                e.preventDefault();
                const n = Number(value.trim());
                if (!Number.isInteger(n) || n < 1 || n > 99999) {
                    setInvalid(true);
                    return;
                }
                setInvalid(false);
                startTransition(async () => {
                    const res = await setFollowedTeamAction(n);
                    if (res.ok) { void syncPushFollows(); router.refresh(); }
                    else setInvalid(true);
                });
            }}
        >
            <input
                value={value}
                onChange={e => setValue(e.target.value)}
                inputMode="numeric"
                placeholder={t("follow.placeholder")}
                aria-label={t("follow.label")}
                aria-invalid={invalid}
                className="h-11 w-40 rounded-[4px] border border-border bg-card px-3 font-mono text-lg tabular-nums text-foreground focus:border-foreground focus:outline-none"
            />
            <button disabled={pending} className="h-11 rounded-[4px] bg-foreground px-5 font-semibold text-background disabled:opacity-50">
                {t("follow.submit")}
            </button>
            {invalid && <p className="w-full text-sm text-danger">{t("follow.invalid")}</p>}
        </form>
    );
}
