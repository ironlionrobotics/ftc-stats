import AdminConsole from "@/components/admin/AdminConsole";
import { ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * Superadmin console. The page shell is public (there's no sidebar link — you
 * navigate here directly), but every byte of real data comes from server
 * actions that verify the caller's ID token email against SUPERADMIN_EMAILS.
 * A non-superadmin sees only the access-denied state.
 */
export default async function AdminPage() {
    const t = await getTranslations("AdminPage");
    return (
        <div className="container mx-auto px-4 md:px-8 py-8 md:py-12 max-w-5xl">
            <header className="mb-8 border-b border-border pb-6">
                <div className="flex items-center gap-2 text-muted-foreground font-mono tracking-[0.2em] text-[11px] uppercase mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    {t("badge")}
                </div>
                <h1 className="text-3xl md:text-4xl font-bold font-display text-foreground flex items-center gap-3">
                    <ShieldCheck className="text-primary" size={32} />
                    {t("title")}
                </h1>
                <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
                    {t("subtitle")}
                </p>
            </header>
            <AdminConsole />
        </div>
    );
}
