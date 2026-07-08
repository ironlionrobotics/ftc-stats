"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import clsx from "clsx";

/**
 * Promise-based confirm() replacement.
 *
 * Usage:
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Borrar?", description: "...", variant: "danger" })) {
 *     // proceed
 *   }
 *
 * Mount <ConfirmProvider /> once at the root layout to enable this hook
 * anywhere in the tree. Native browser confirm() blocks the main thread and
 * looks like a phishing prompt on mobile; this version is styled, keyboard-
 * accessible (Esc, Enter, Tab), and dismissible by clicking the backdrop.
 */

interface ConfirmOptions {
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "default" | "danger";
}

type Resolver = (result: boolean) => void;

interface ConfirmContextValue {
    confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const [opts, setOpts] = useState<ConfirmOptions>({ title: "" });
    const resolverRef = useRef<Resolver | null>(null);

    const confirm = useCallback((newOpts: ConfirmOptions) => {
        setOpts(newOpts);
        setOpen(true);
        return new Promise<boolean>(resolve => {
            resolverRef.current = resolve;
        });
    }, []);

    const handleResult = (result: boolean) => {
        setOpen(false);
        // Resolve on next tick so the dialog finishes closing before the
        // caller acts on the result (prevents visual flash).
        const r = resolverRef.current;
        resolverRef.current = null;
        if (r) setTimeout(() => r(result), 0);
    };

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            <AlertDialog.Root open={open} onOpenChange={o => !o && handleResult(false)}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                    <AlertDialog.Content
                        className={clsx(
                            "fixed left-1/2 top-1/2 z-[111] -translate-x-1/2 -translate-y-1/2",
                            "w-full max-w-md p-6 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl",
                            "data-[state=open]:animate-in data-[state=closed]:animate-out",
                            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                        )}
                    >
                        <AlertDialog.Title className="text-lg font-bold text-white">
                            {opts.title}
                        </AlertDialog.Title>
                        {opts.description && (
                            <AlertDialog.Description className="mt-2 text-sm text-gray-400 leading-relaxed">
                                {opts.description}
                            </AlertDialog.Description>
                        )}
                        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                            <AlertDialog.Cancel asChild>
                                <button
                                    type="button"
                                    onClick={() => handleResult(false)}
                                    className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-bold rounded-lg min-h-[44px]"
                                >
                                    {opts.cancelText ?? "Cancelar"}
                                </button>
                            </AlertDialog.Cancel>
                            <AlertDialog.Action asChild>
                                <button
                                    type="button"
                                    onClick={() => handleResult(true)}
                                    className={clsx(
                                        "px-4 py-2.5 text-white text-sm font-bold rounded-lg min-h-[44px]",
                                        opts.variant === "danger"
                                            ? "bg-red-500 hover:bg-red-600"
                                            : "bg-primary hover:bg-primary/90",
                                    )}
                                >
                                    {opts.confirmText ?? "Confirmar"}
                                </button>
                            </AlertDialog.Action>
                        </div>
                    </AlertDialog.Content>
                </AlertDialog.Portal>
            </AlertDialog.Root>
        </ConfirmContext.Provider>
    );
}

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
    const ctx = useContext(ConfirmContext);
    if (!ctx) {
        // Fall back to native confirm if the provider isn't mounted, so
        // pages that haven't migrated yet keep working.
        return (opts: ConfirmOptions) =>
            Promise.resolve(window.confirm(opts.title + (opts.description ? `\n\n${opts.description}` : "")));
    }
    return ctx.confirm;
}
