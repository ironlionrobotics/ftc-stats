"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Flag, Trash2, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { listMediaReportsAction, removeMediaAction, dismissMediaReportsAction, type ReportedMedia } from "@/app/actions/media-moderation";
import { mediaBlobUrl } from "@/lib/team-media-service";

/** Superadmin queue of reported Trading Card media (#106): remove or dismiss. */
export default function MediaReportsReview() {
    const t = useTranslations("AdminMedia");
    const tErr = useTranslations("Errors");
    const { user } = useAuth();
    const [items, setItems] = useState<ReportedMedia[] | null>(null);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        (async () => {
            const r = await listMediaReportsAction(await user.getIdToken());
            if (cancelled) return;
            if (r.ok) setItems(r.items); else toast.error(tErr(r.code));
        })();
        return () => { cancelled = true; };
    }, [user, tErr, reload]);

    const act = async (fn: typeof removeMediaAction, mediaId: string) => {
        if (!user) return;
        const r = await fn({ idToken: await user.getIdToken(), mediaId });
        if (!r.ok) toast.error(tErr(r.code)); else setReload(k => k + 1);
    };

    return (
        <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
            <h2 className="mb-1 flex items-center gap-2 text-lg font-bold"><Flag size={18} /> {t("title")}</h2>
            <p className="mb-4 text-sm text-muted-foreground">{t("subtitle")}</p>
            {items === null ? <p className="text-sm text-muted-foreground">…</p>
                : items.length === 0 ? <p className="text-sm text-muted-foreground">{t("empty")}</p>
                : (
                    <ul className="divide-y divide-border">
                        {items.map(({ media, reports }) => (
                            <li key={media.id} className="flex flex-wrap items-center gap-3 py-3">
                                <Preview path={media.thumbPath ?? (media.kind === "photo" ? media.path : undefined)} youtubeId={media.youtubeId} />
                                <div className="min-w-0 flex-1 text-sm">
                                    <div className="font-semibold">{t("line", { team: media.teamNumber, kind: media.kind, n: reports })}</div>
                                    {media.caption && <div className="text-muted-foreground">{media.caption}</div>}
                                </div>
                                <button type="button" onClick={() => act(removeMediaAction, media.id)} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-border px-3 text-sm text-danger"><Trash2 size={14} /> {t("remove")}</button>
                                <button type="button" onClick={() => act(dismissMediaReportsAction, media.id)} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-border px-3 text-sm"><Check size={14} /> {t("dismiss")}</button>
                            </li>
                        ))}
                    </ul>
                )}
        </section>
    );
}

function Preview({ path, youtubeId }: { path?: string; youtubeId?: string }) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!path) return;
        let cancelled = false;
        mediaBlobUrl(path).then(u => { if (!cancelled) setUrl(u); }).catch(() => {});
        return () => { cancelled = true; };
    }, [path]);
    if (youtubeId) return <a href={`https://www.youtube.com/watch?v=${youtubeId}`} target="_blank" rel="noreferrer" className="text-sm underline">YouTube</a>;
    // eslint-disable-next-line @next/next/no-img-element
    return url ? <img src={url} alt="" className="h-16 w-16 rounded-md object-cover" /> : <span className="h-16 w-16 rounded-md bg-muted" />;
}
