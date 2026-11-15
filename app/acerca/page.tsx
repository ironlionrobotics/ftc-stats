import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarDays, ClipboardList, Home, Swords, Users, ShieldCheck, TrendingUp, Smartphone, Globe2, Check } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("About");
    return { title: t("metaTitle"), description: t("metaDescription") };
}

const TASKS = [
    { key: "today", icon: Home, href: "/" },
    { key: "event", icon: CalendarDays, href: "/event" },
    { key: "capture", icon: ClipboardList, href: "/scouting" },
    { key: "strategy", icon: Swords, href: "/strategy" },
] as const;

const DIFF = [
    { key: "pool", icon: Users },
    { key: "truth", icon: ShieldCheck },
    { key: "playoffs", icon: TrendingUp },
    { key: "venue", icon: Smartphone },
] as const;

const STEPS = ["one", "two", "three"] as const;
const PRINCIPLES = ["free", "privacy", "source"] as const;

/**
 * What PRIDE is (decision #116 follow-up): a public, bilingual explainer for
 * FTC teams anywhere. Every claim maps to something the app does today; the
 * accuracy figures are the Oracle validation (7 seasons, 21,436 playoff
 * matches, ~76%, calibration within 3 pp — decisions #51–#60). Push alerts
 * are not mentioned until they are live in production.
 */
export default async function AboutPage() {
    const t = await getTranslations("About");
    return (
        <div className="container mx-auto max-w-3xl space-y-12 px-4 py-8 md:px-8 md:py-12">
            <section className="space-y-5">
                <div className="flex items-center gap-3">
                    <span className="relative h-14 w-14 overflow-hidden rounded-2xl">
                        <Image src="/icon.png" alt="" fill sizes="56px" className="object-contain" priority />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("kicker")}</span>
                </div>
                <h1 className="text-[40px] font-extrabold leading-[1.1] tracking-tight text-balance">{t("title")}</h1>
                <p className="max-w-prose text-base leading-relaxed text-muted-foreground">{t("lede")}</p>
                <div className="flex flex-wrap gap-2">
                    <Link href="/" className="flex min-h-[48px] items-center rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground">{t("ctaFollow")}</Link>
                    <Link href="/event" className="flex min-h-[48px] items-center rounded-xl border border-border px-5 text-sm font-bold text-foreground hover:bg-muted">{t("ctaEvent")}</Link>
                </div>
                <p className="text-xs text-muted-foreground">{t("noAccount")}</p>
            </section>

            <section aria-labelledby="tasks-title" className="space-y-4">
                <h2 id="tasks-title" className="text-xl font-bold">{t("tasksTitle")}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                    {TASKS.map(({ key, icon: Icon, href }) => (
                        <Link key={key} href={href} className="group rounded-2xl border border-border bg-card p-4 hover:bg-muted">
                            <span className="flex items-center gap-2 text-base font-bold">
                                <Icon className="h-5 w-5 text-brand-ink" aria-hidden /> {t(`tasks.${key}.title`)}
                            </span>
                            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(`tasks.${key}.body`)}</p>
                        </Link>
                    ))}
                </div>
            </section>

            <section aria-labelledby="diff-title" className="space-y-4">
                <h2 id="diff-title" className="text-xl font-bold">{t("diffTitle")}</h2>
                <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
                    {DIFF.map(({ key, icon: Icon }) => (
                        <li key={key} className="flex gap-3 p-4">
                            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" aria-hidden />
                            <div>
                                <h3 className="text-base font-bold">{t(`diff.${key}.title`)}</h3>
                                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`diff.${key}.body`)}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            </section>

            <section aria-labelledby="acc-title" className="rounded-2xl border border-border bg-card p-5">
                <h2 id="acc-title" className="text-xl font-bold">{t("accuracyTitle")}</h2>
                <p className="mt-3 font-mono text-[40px] font-extrabold leading-none tabular-nums text-brand-ink">{t("accuracyStat")}</p>
                <p className="mt-3 text-sm leading-relaxed text-foreground">{t("accuracyBody")}</p>
                <p className="mt-2 text-xs text-muted-foreground">{t("accuracyNote")}</p>
                <Link href="/oracle" className="mt-4 inline-flex min-h-[44px] items-center text-sm font-bold text-foreground underline underline-offset-4">{t("accuracyLink")}</Link>
            </section>

            <section aria-labelledby="world-title" className="space-y-3">
                <h2 id="world-title" className="flex items-center gap-2 text-xl font-bold">
                    <Globe2 className="h-5 w-5 text-brand-ink" aria-hidden /> {t("worldTitle")}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{t("worldBody")}</p>
                <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">{t("frcSoon")}</span>
            </section>

            <section aria-labelledby="start-title" className="space-y-4">
                <h2 id="start-title" className="text-xl font-bold">{t("startTitle")}</h2>
                <ol className="space-y-3">
                    {STEPS.map((key, i) => (
                        <li key={key} className="flex gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand font-mono text-sm font-extrabold text-brand-foreground" aria-hidden>{i + 1}</span>
                            <div>
                                <h3 className="text-base font-bold">{t(`steps.${key}.title`)}</h3>
                                <p className="text-sm text-muted-foreground">{t(`steps.${key}.body`)}</p>
                            </div>
                        </li>
                    ))}
                </ol>
                <Link href="/" className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground sm:w-auto sm:inline-flex">{t("ctaFollow")}</Link>
            </section>

            <section aria-labelledby="rules-title" className="space-y-3 border-t border-border pt-8">
                <h2 id="rules-title" className="text-base font-bold">{t("principlesTitle")}</h2>
                <ul className="space-y-2">
                    {PRINCIPLES.map(key => (
                        <li key={key} className="flex gap-2 text-sm text-muted-foreground">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> {t(`principles.${key}`)}
                        </li>
                    ))}
                </ul>
                <p className="pt-2 text-xs text-muted-foreground">{t("madeBy")}</p>
            </section>
        </div>
    );
}
