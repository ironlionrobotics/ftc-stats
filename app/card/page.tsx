import { getTranslations } from "next-intl/server";
import { IdCard } from "lucide-react";
import TradingCardEditor from "@/components/card/TradingCardEditor";

export default async function TradingCardPage() {
    const t = await getTranslations("TradingCard");
    return (
        <div className="container mx-auto px-4 py-8 max-w-6xl">
            <header className="mb-8">
                <h1 className="text-3xl font-black font-display tracking-tight text-foreground flex items-center gap-3">
                    <IdCard className="text-primary" /> {t("title")}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
            </header>
            <TradingCardEditor />
        </div>
    );
}
