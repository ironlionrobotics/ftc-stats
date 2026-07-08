import { z, type ZodTypeAny } from "zod";
import type { GameDefinition, GameField } from "@/types/game-definition";

/**
 * Build a Zod object schema directly from a GameDefinition. Each field
 * becomes a column in the resulting object; values validate at form-submit
 * time the same way the hand-written ftcIntoTheDeepFormSchema does today.
 *
 * Always coerces numerics with `z.coerce.number()` because HTML inputs
 * return strings — same trick used in the existing schemas.
 */
export function zodSchemaFromDefinition(def: GameDefinition): z.ZodObject<Record<string, ZodTypeAny>> {
    const shape: Record<string, ZodTypeAny> = {};
    for (const section of def.sections) {
        for (const field of section.fields) {
            shape[field.id] = zodForField(field);
        }
    }
    return z.object(shape);
}

function zodForField(field: GameField): ZodTypeAny {
    switch (field.kind) {
        case "counter": {
            const min = field.min ?? 0;
            const max = field.max ?? 999;
            return z.coerce.number().int().min(min).max(max).default(min);
        }
        case "boolean":
            return z.boolean().default(false);
        case "stars": {
            const max = field.max ?? 5;
            return z.coerce.number().int().min(1).max(max).default(Math.ceil(max / 2));
        }
        case "enum": {
            const values = field.options.map(o => o.value);
            if (values.length === 0) {
                throw new Error(`Enum field ${field.id} has no options`);
            }
            return z.enum(values as [string, ...string[]]).default(values[0]);
        }
        case "text":
        case "textarea":
            return z.string().max(field.maxLength ?? 2000).default("");
    }
}

/**
 * Convenience: returns a typed Zod schema PLUS the inferred TS type for the
 * shape. Use the type as a generic to useForm<FormValues>(...) to keep the
 * rest of the form callsite typed.
 */
export type DefinitionFormValues<_T extends GameDefinition> = z.infer<
    ReturnType<typeof zodSchemaFromDefinition>
>;
