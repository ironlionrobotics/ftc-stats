/**
 * Stable error CODES for anything a user can see.
 *
 * Rationale (i18n): errors are produced in places that have no locale — pure
 * helpers, server actions, Zod schemas — and are rendered somewhere else
 * entirely. So the producer emits a code and the renderer translates it with
 * `useTranslations("Errors")`. Codes are dot-paths RELATIVE to the `Errors`
 * namespace in messages/{en,es}.json, so `tErr(code)` resolves by nesting
 * without any lookup table.
 *
 * Isomorphic and dependency-free on purpose: imported by client components,
 * server actions and framework-free lib helpers alike.
 */
export type ErrorCode =
    | "generic"
    | "auth.missingToken"
    | "auth.invalidToken"
    | "auth.userNotFound"
    | "invite.tooShort"
    | "invite.notFound"
    | "invite.expired"
    | "invite.maxUses"
    | "invite.orgMissing"
    | "org.alreadyExists"
    | "org.codeGeneration"
    // Form-level validation. `validation.wouldPick` is also used as a Zod
    // `message`, resolved at render time by useZodMessage().
    | "validation.teamNumber"
    | "validation.teamName"
    | "validation.wouldPick";

/**
 * Error carrying a stable code. `message` is the code itself so stack traces
 * and server logs stay greppable (`CodedError: invite.expired`).
 */
export class CodedError extends Error {
    constructor(public readonly code: ErrorCode) {
        super(code);
        this.name = "CodedError";
    }
}

/**
 * Narrows an unknown throwable to a code. Anything that isn't a CodedError is
 * an internal failure the user shouldn't see verbatim, so it collapses to
 * "generic" — callers should log the original server-side before discarding it.
 */
export function toErrorCode(e: unknown): ErrorCode {
    return e instanceof CodedError ? e.code : "generic";
}
