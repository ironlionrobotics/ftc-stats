"use client";

import { type Control, useController } from "react-hook-form";
import type {
    GameDefinition,
    GameField,
    GameSection,
} from "@/types/game-definition";
import { Card } from "@/components/ui/Card";
import { Plus, Minus } from "lucide-react";
import clsx from "clsx";

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
 * hand-written FTC_IntoTheDeepForm uses a custom 3-column layout — that's
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
    purple: "text-purple-400",
    green: "text-green-400",
    amber: "text-amber-400",
    cyan: "text-cyan-400",
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
    const accent = section.accent ? ACCENT_STYLES[section.accent] : "text-white";
    return (
        <Card className="p-5 bg-white/[0.02] border-white/10">
            <h3 className={clsx("text-xs font-bold uppercase tracking-widest mb-4", accent)}>
                {section.label}
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
    return (
        <div className="flex items-baseline justify-between mb-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                {field.label}
            </label>
            {field.helpText && (
                <span className="text-[10px] text-gray-600 italic">{field.helpText}</span>
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
    const value = typeof rhf.value === "number" ? rhf.value : Number(rhf.value) || 0;
    const min = field.min ?? 0;
    const max = field.max ?? 999;
    const colorClass = {
        primary: "text-white",
        purple: "text-purple-400",
        green: "text-green-400",
        cyan: "text-cyan-400",
        amber: "text-amber-400",
    }[field.color ?? "primary"];
    return (
        <div>
            <FieldLabel field={field} />
            <div className="flex items-center gap-3 bg-black/40 p-1 rounded-lg border border-white/5">
                <button
                    type="button"
                    onClick={() => rhf.onChange(Math.max(min, value - 1))}
                    disabled={disabled}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/5 rounded-md hover:bg-white/10 text-gray-400 active:bg-white/20 disabled:opacity-50 transition-colors"
                    aria-label={`Decrementar ${field.label}`}
                >
                    <Minus size={16} />
                </button>
                <span className={clsx("text-xl font-black w-12 text-center", colorClass)}>{value}</span>
                <button
                    type="button"
                    onClick={() => rhf.onChange(Math.min(max, value + 1))}
                    disabled={disabled}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/5 rounded-md hover:bg-white/10 text-gray-400 active:bg-white/20 disabled:opacity-50 transition-colors"
                    aria-label={`Incrementar ${field.label}`}
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
    const checked = !!rhf.value;
    return (
        <label className={clsx(
            "min-h-[44px] flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer group",
            checked ? "bg-primary/20 border-primary/50" : "bg-white/5 border-white/10 hover:border-white/20",
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
                checked ? "text-white" : "text-gray-400 group-hover:text-gray-300",
            )}>
                {field.label}
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
                                ? "bg-primary border-primary text-white"
                                : "bg-white/5 border-white/10 text-gray-500 hover:border-white/30",
                        )}
                        aria-label={`${field.label} ${star} de ${max}`}
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
                                ? "bg-white text-black border-white"
                                : "bg-white/5 border-white/10 text-gray-500 hover:border-white/30",
                        )}
                    >
                        {option.label}
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
    if (field.kind === "textarea") {
        return (
            <div className="col-span-full">
                <FieldLabel field={field} />
                <textarea
                    {...rhf}
                    value={(rhf.value as string) ?? ""}
                    placeholder={field.placeholder}
                    disabled={disabled}
                    maxLength={field.maxLength}
                    className="w-full h-24 px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-primary outline-none disabled:opacity-50"
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
                placeholder={field.placeholder}
                disabled={disabled}
                maxLength={field.maxLength}
                className="w-full min-h-[44px] px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white focus:ring-2 focus:ring-primary outline-none disabled:opacity-50"
            />
        </div>
    );
}
