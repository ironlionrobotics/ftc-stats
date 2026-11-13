"use client";

import { useTranslations } from "next-intl";
import clsx from "clsx";
import { SCOUTING_CONTEXTS, contextOf, type ScoutingContext } from "@/lib/scouting-context";

/**
 * Segmented control for where an observation is taken (#101): practice
 * field, practice match, qualification or playoff. Radio semantics so it is
 * keyboard- and screen-reader-operable.
 */
export default function ContextPicker({ value, onChange }: { value: ScoutingContext; onChange: (v: ScoutingContext) => void }) {
    const t = useTranslations("ScoutingContext");
    return (
        <fieldset>
            <legend className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">{t("label")}</legend>
            <div role="radiogroup" aria-label={t("label")} className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-background p-1 sm:grid-cols-4">
                {SCOUTING_CONTEXTS.map(ctx => (
                    <button
                        key={ctx}
                        type="button"
                        role="radio"
                        aria-checked={value === ctx}
                        onClick={() => onChange(ctx)}
                        className={clsx(
                            "min-h-[40px] rounded-md px-2 text-sm font-semibold transition-colors",
                            value === ctx ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {t(`option.${ctx}`)}
                    </button>
                ))}
            </div>
            {value !== "QUALIFICATION" && value !== "PLAYOFF" && (
                <p className="mt-1 text-xs text-muted-foreground">{t("practiceNote")}</p>
            )}
        </fieldset>
    );
}

/** Small label for a saved entry's context; nothing for plain qualification. */
export function ContextBadge({ entry }: { entry: { tournamentLevel?: string | null } }) {
    const t = useTranslations("ScoutingContext");
    const ctx = contextOf(entry);
    if (ctx === "QUALIFICATION") return null;
    return (
        <span className="rounded border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {t(`option.${ctx}`)}
        </span>
    );
}
