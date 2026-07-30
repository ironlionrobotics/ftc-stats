"use client";

import { type Control, useController } from "react-hook-form";
import { useTranslations } from "next-intl";
import type {
    GameDefinition,
    GameField,
    GameSection,
} from "@/types/game-definition";
import { Card } from "@/components/ui/Card";
import { Plus, Minus } from "lucide-react";
import clsx from "clsx";

/**
 * GameDefinition display strings (section/field labels, helpText,
 * placeholder, enum option labels) are i18n dot-path keys relative to the
 * `Games` catalog namespace, not literal prose. Same `t.has()` + fallback
 * idiom as `useZodMessage` (lib/hooks/use-zod-message.ts): a key with no
 * catalog entry — an uncataloged definition, or a future user-authored
 * custom field — degrades to rendering the string verbatim instead of
 * throwing or blanking the UI.
 */
function useGameLabel() {
    const tGames = useTranslations("Games");
    return (s?: string) => (s && tGames.has(s) ? tGames(s) : s);
}

interface DynamicGameFormProps {
    definition: GameDefinition;
    /**
     * RHF control bound to a form whose values match the definition's shape.
     * Caller is responsible for wiring useForm + Zod resolver (via
     * `zodSchemaFromDefinition(definition)`).
     */
    control: Control<Record<string, unknown>>;
    /** When true, all inputs are disabled. Useful for read-only views. */
    disabled?: boolean;
}

/**
 * Renders a game form from its declarative definition. One Card per section,
 * fields stacked inside in the order declared.
 *
 * Layout is intentionally simple (1 column on mobile, 2 columns on lg). The
 * hand-written FTC_DecodeForm uses a custom 3-column layout — that's
 * the trade-off of going generic. If a season really needs a custom layout,
 * write a one-off component for that season (still saves work on every other
 * year). For the common case, generic is fine.
 */
export default function DynamicGameForm({ definition, control, disabled }: DynamicGameFormProps) {
    return (
        <div className="space-y-4">
            {definition.sections.map(section => (
                <SectionCard
                    key={section.id}
                    section={section}
                    control={control}
                    disabled={disabled}
                />
            ))}
        </div>
    );
}

const ACCENT_STYLES: Record<NonNullable<GameSection["accent"]>, string> = {
    primary: "text-primary",
    purple: "text-primary",
    green: "text-success",
    amber: "text-warning",
    cyan: "text-secondary",
};

function SectionCard({
    section,
    control,
    disabled,
}: {
    section: GameSection;
    control: Control<Record<string, unknown>>;
    disabled?: boolean;
}) {
    const accent = section.accent ? ACCENT_STYLES[section.accent] : "text-foreground";
    const gameLabel = useGameLabel();
    return (
        <Card className="p-5 bg-muted border-border">
            <h3 className={clsx("text-xs font-bold uppercase tracking-widest mb-4", accent)}>
                {gameLabel(section.label)}
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {section.fields.map(field => (
                    <FieldRenderer
                        key={field.id}
                        field={field}
                        control={control}
                        disabled={disabled}
                    />
                ))}
            </div>
        </Card>
    );
}

function FieldRenderer({
    field,
    control,
    disabled,
}: {
    field: GameField;
    control: Control<Record<string, unknown>>;
    disabled?: boolean;
}) {
    switch (field.kind) {
        case "counter":
            return <CounterFieldRender field={field} control={control} disabled={disabled} />;
        case "boolean":
            return <BooleanFieldRender field={field} control={control} disabled={disabled} />;
        case "stars":
            return <StarsFieldRender field={field} control={control} disabled={disabled} />;
        case "enum":
            return <EnumFieldRender field={field} control={control} disabled={disabled} />;
        case "text":
        case "textarea":
            return <TextFieldRender field={field} control={control} disabled={disabled} />;
    }
}

function FieldLabel({ field }: { field: GameField }) {
    const gameLabel = useGameLabel();
    return (
        <div className="flex items-baseline justify-between mb-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {gameLabel(field.label)}
            </label>
            {field.helpText && (
                <span className="text-[10px] text-muted-foreground italic">{gameLabel(field.helpText)}</span>
            )}
        </div>
    );
}

function CounterFieldRender({
    field,
    control,
    disabled,
}: {
    field: import("@/types/game-definition").CounterField;
    control: Control<Record<string, unknown>>;
    disabled?: boolean;
}) {
    const { field: rhf } = useController({ control, name: field.id as never });
    const gameLabel = useGameLabel();
    const tGames = useTranslations("Games");
    const value = typeof rhf.value === "number" ? rhf.value : Number(rhf.value) || 0;
    const min = field.min ?? 0;
    const max = field.max ?? 999;
    const colorClass = {
        primary: "text-foreground",
        purple: "text-primary",
        green: "text-success",
        cyan: "text-secondary",
        amber: "text-warning",
    }[field.color ?? "primary"];
    return (
        <div>
            <FieldLabel field={field} />
            <div className="flex items-center gap-3 bg-muted p-1 rounded-lg border border-border">
                <button
                    type="button"
                    onClick={() => rhf.onChange(Math.max(min, value - 1))}
                    disabled={disabled}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-muted rounded-md hover:bg-border text-muted-foreground active:bg-border disabled:opacity-50 transition-colors"
                    aria-label={tGames("aria.decrement", { label: gameLabel(field.label) ?? field.id })}
                >
                    <Minus size={16} />
                </button>
                <span className={clsx("text-xl font-black w-12 text-center", colorClass)}>{value}</span>
                <button
                    type="button"
                    onClick={() => rhf.onChange(Math.min(max, value + 1))}
                    disabled={disabled}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-muted rounded-md hover:bg-border text-muted-foreground active:bg-border disabled:opacity-50 transition-colors"
                    aria-label={tGames("aria.increment", { label: gameLabel(field.label) ?? field.id })}
                >
                    <Plus size={16} />
                </button>
            </div>
        </div>
    );
}

function BooleanFieldRender({
    field,
    control,
    disabled,
}: {
    field: import("@/types/game-definition").BooleanField;
    control: Control<Record<string, unknown>>;
    disabled?: boolean;
}) {
    const { field: rhf } = useController({ control, name: field.id as never });
    const gameLabel = useGameLabel();
    const checked = !!rhf.value;
    return (
        <label className={clsx(
            "min-h-[44px] flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer group",
            checked ? "bg-primary/20 border-primary/50" : "bg-muted border-border hover:border-foreground/20",
            disabled && "opacity-60 cursor-not-allowed",
        )}>
            <input
                type="checkbox"
                checked={checked}
                onChange={e => rhf.onChange(e.target.checked)}
                disabled={disabled}
                className="w-4 h-4 accent-primary"
            />
            <span className={clsx(
                "text-sm font-medium transition-colors",
                checked ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
            )}>
                {gameLabel(field.label)}
            </span>
        </label>
    );
}

function StarsFieldRender({
    field,
    control,
    disabled,
}: {
    field: import("@/types/game-definition").StarsField;
    control: Control<Record<string, unknown>>;
    disabled?: boolean;
}) {
    const { field: rhf } = useController({ control, name: field.id as never });
    const gameLabel = useGameLabel();
    const tGames = useTranslations("Games");
    const value = typeof rhf.value === "number" ? rhf.value : Number(rhf.value) || 0;
    const max = field.max ?? 5;
    return (
        <div>
            <FieldLabel field={field} />
            <div className="flex gap-1">
                {Array.from({ length: max }, (_, i) => i + 1).map(star => (
                    <button
                        key={star}
                        type="button"
                        onClick={() => rhf.onChange(star)}
                        disabled={disabled}
                        className={clsx(
                            "min-h-[44px] flex-1 py-2 rounded-lg font-bold transition-all border disabled:opacity-50",
                            value === star
                                ? "bg-primary border-primary text-primary-foreground"
                                : "bg-muted border-border text-muted-foreground hover:border-foreground/20",
                        )}
                        aria-label={tGames("aria.star", { label: gameLabel(field.label) ?? field.id, star, max })}
                    >
                        {star}
                    </button>
                ))}
            </div>
        </div>
    );
}

function EnumFieldRender({
    field,
    control,
    disabled,
}: {
    field: import("@/types/game-definition").EnumField;
    control: Control<Record<string, unknown>>;
    disabled?: boolean;
}) {
    const { field: rhf } = useController({ control, name: field.id as never });
    const gameLabel = useGameLabel();
    return (
        <div>
            <FieldLabel field={field} />
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(field.options.length, 4)}, 1fr)` }}>
                {field.options.map(option => (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => rhf.onChange(option.value)}
                        disabled={disabled}
                        className={clsx(
                            "min-h-[44px] py-2 px-2 text-xs font-bold rounded border transition-all disabled:opacity-50",
                            rhf.value === option.value
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted border-border text-muted-foreground hover:border-foreground/20",
                        )}
                    >
                        {gameLabel(option.label)}
                    </button>
                ))}
            </div>
        </div>
    );
}

function TextFieldRender({
    field,
    control,
    disabled,
}: {
    field: import("@/types/game-definition").TextField;
    control: Control<Record<string, unknown>>;
    disabled?: boolean;
}) {
    const { field: rhf } = useController({ control, name: field.id as never });
    const gameLabel = useGameLabel();
    if (field.kind === "textarea") {
        return (
            <div className="col-span-full">
                <FieldLabel field={field} />
                <textarea
                    {...rhf}
                    value={(rhf.value as string) ?? ""}
                    placeholder={gameLabel(field.placeholder)}
                    disabled={disabled}
                    maxLength={field.maxLength}
                    className="w-full h-24 px-4 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:ring-2 focus:ring-primary outline-none disabled:opacity-50"
                />
            </div>
        );
    }
    return (
        <div>
            <FieldLabel field={field} />
            <input
                {...rhf}
                value={(rhf.value as string) ?? ""}
                type="text"
                placeholder={gameLabel(field.placeholder)}
                disabled={disabled}
                maxLength={field.maxLength}
                className="w-full min-h-[44px] px-4 py-2 bg-muted border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary outline-none disabled:opacity-50"
            />
        </div>
    );
}
