"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import clsx from "clsx";
import { ImagePlus, Film, Youtube, Star, Trash2, Flag, X, Play, Loader2 } from "lucide-react";
import type { UploadTask } from "firebase/storage";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
    listenTeamMedia, uploadPhoto, uploadClip, probeClip, addYouTube, deleteMedia, setProfileMedia,
    reportMedia, updateCaption, mediaBlobUrl, MediaUploadError,
} from "@/lib/team-media-service";
import { canAdd, parseYouTubeId, validateClip, validatePhotoInput, MEDIA_LIMITS, type TeamMedia } from "@/lib/team-media";

/**
 * Robot photos, clips and YouTube links of a team (#106). Managers (admin or
 * lead of the team) upload, caption, delete and pick the profile photo; other
 * approved teams view and can report. Files load through the Storage SDK
 * under rules — never as public URLs.
 */
export default function MediaGallery({
    season, teamNumber, uid, canManage, profileMediaId, onMedia, onProfileChange,
}: {
    season: number;
    teamNumber: number;
    uid: string;
    canManage: boolean;
    profileMediaId?: string | null;
    onMedia?: (media: TeamMedia[]) => void;
    onProfileChange?: (mediaId: string | null) => void;
}) {
    const t = useTranslations("CardMedia");
    const tErr = useTranslations("CardMedia.errors");
    const confirm = useConfirm();
    const [media, setMedia] = useState<TeamMedia[]>([]);
    // The open item is looked up live, so captions/deletions reflect immediately.
    const [openId, setOpenId] = useState<string | null>(null);
    const [consent, setConsent] = useState(false);
    const [caption, setCaption] = useState("");
    const [yt, setYt] = useState("");
    const [progress, setProgress] = useState<number | null>(null);
    const taskRef = useRef<UploadTask | null>(null);
    const photoInput = useRef<HTMLInputElement>(null);
    const clipInput = useRef<HTMLInputElement>(null);

    // onMedia is held in a ref so an inline callback can't resubscribe the listener.
    const onMediaRef = useRef(onMedia);
    useEffect(() => { onMediaRef.current = onMedia; }, [onMedia]);
    useEffect(() => listenTeamMedia(season, teamNumber, rows => { setMedia(rows); onMediaRef.current?.(rows); }), [season, teamNumber]);
    const open = media.find(m => m.id === openId) ?? null;
    const setOpen = (m: TeamMedia | null) => setOpenId(m?.id ?? null);

    const fail = (e: unknown) => {
        // A user-cancelled upload is not an error.
        if ((e as { code?: string })?.code === "storage/canceled") return;
        const code = e instanceof MediaUploadError ? e.code : "media.upload";
        toast.error(tErr(code.replace("media.", "")));
    };
    const needConsent = () => {
        if (!consent) toast.error(tErr("consentRequired"));
        return consent;
    };
    const ctx = () => ({ season, teamNumber, uid, caption, onProgress: setProgress, onTask: (tk: UploadTask) => { taskRef.current = tk; } });

    const onPhoto = async (file: File | undefined) => {
        if (!file || !needConsent()) return;
        if (validatePhotoInput(file.type)) return toast.error(tErr("badType"));
        if (!canAdd("photo", media)) return toast.error(tErr("tooMany"));
        setProgress(0);
        try {
            await uploadPhoto(file, ctx());
            setCaption("");
            setConsent(false); // confirmed per upload
            toast.success(t("uploaded"));
        } catch (e) { fail(e); } finally { setProgress(null); taskRef.current = null; }
    };
    const onClip = async (file: File | undefined) => {
        if (!file || !needConsent()) return;
        if (!canAdd("clip", media)) return toast.error(tErr("tooMany"));
        setProgress(0);
        try {
            const probe = await probeClip(file);
            const err = validateClip({ type: file.type, bytes: file.size, durationS: probe.durationS });
            if (err) throw new MediaUploadError(err);
            await uploadClip(file, probe, ctx());
            setCaption("");
            setConsent(false);
            toast.success(t("uploaded"));
        } catch (e) { fail(e); } finally { setProgress(null); taskRef.current = null; }
    };
    const onYouTube = async () => {
        if (!needConsent()) return;
        const id = parseYouTubeId(yt);
        if (!id) return toast.error(tErr("badYoutube"));
        if (!canAdd("youtube", media)) return toast.error(tErr("tooMany"));
        try {
            await addYouTube(id, { season, teamNumber, uid, caption });
            setYt(""); setCaption(""); setConsent(false);
        } catch (e) { fail(e); }
    };
    const remove = async (m: TeamMedia) => {
        if (!(await confirm({ title: t("deleteTitle"), description: t("deleteBody"), confirmText: t("delete") }))) return;
        try {
            await deleteMedia(m);
            if (profileMediaId === m.id) {
                await setProfileMedia(season, teamNumber, null);
                onProfileChange?.(null);
            }
            setOpen(null);
        } catch (e) { fail(e); }
    };
    const report = async (m: TeamMedia) => {
        const ok = await confirm({ title: t("reportTitle"), description: t("reportBody"), confirmText: t("report") });
        if (!ok) return;
        try {
            await reportMedia(m.id, "card", uid);
            toast.success(t("reported"));
        } catch (e) { fail(e); }
    };

    return (
        <div className="space-y-3">
            {canManage && (
                <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                    <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1" />
                        <span>{t("consent")}</span>
                    </label>
                    <p className="text-xs text-muted-foreground">{t("tip", { photos: MEDIA_LIMITS.photos, clips: MEDIA_LIMITS.clips, seconds: MEDIA_LIMITS.clipMaxSeconds })}</p>
                    <input value={caption} onChange={e => setCaption(e.target.value)} maxLength={MEDIA_LIMITS.captionMax} placeholder={t("captionPh")}
                        aria-label={t("captionPh")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={progress !== null} onClick={() => photoInput.current?.click()}
                            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
                            <ImagePlus size={16} /> {t("addPhoto")}
                        </button>
                        <button type="button" disabled={progress !== null} onClick={() => clipInput.current?.click()}
                            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50">
                            <Film size={16} /> {t("addClip")}
                        </button>
                        <input ref={photoInput} type="file" accept="image/*" hidden onChange={e => { void onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
                        <input ref={clipInput} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={e => { void onClip(e.target.files?.[0]); e.target.value = ""; }} />
                    </div>
                    <div className="flex gap-2">
                        <input value={yt} onChange={e => setYt(e.target.value)} placeholder={t("youtubePh")} aria-label={t("youtubePh")}
                            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                        <button type="button" onClick={onYouTube} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-border px-3 text-sm"><Youtube size={16} /> {t("addYoutube")}</button>
                    </div>
                    {progress !== null && (
                        <div className="flex items-center gap-2 text-xs">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
                            <span className="tabular-nums">{Math.round(progress * 100)}%</span>
                            <button type="button" onClick={() => taskRef.current?.cancel()} className="rounded border border-border px-2 py-1">{t("cancel")}</button>
                        </div>
                    )}
                </div>
            )}

            {media.length === 0 ? (
                <p className="text-sm text-muted-foreground">{canManage ? t("emptyOwn") : t("empty")}</p>
            ) : (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {media.map(m => (
                        <li key={m.id} className="relative">
                            <button type="button" onClick={() => setOpen(m)} aria-label={m.caption || t(`kind.${m.kind}`)}
                                className={clsx("relative block aspect-square w-full overflow-hidden rounded-lg border bg-muted", profileMediaId === m.id ? "border-primary ring-2 ring-primary" : "border-border")}>
                                <Thumb media={m} />
                                {m.kind !== "photo" && <span className="absolute inset-0 flex items-center justify-center"><Play className="h-8 w-8 rounded-full bg-black/50 p-1.5 text-white" /></span>}
                                {profileMediaId === m.id && <Star className="absolute left-1 top-1 h-5 w-5 fill-primary text-primary" />}
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {open && (
                <div role="dialog" aria-modal="true" aria-label={open.caption || t(`kind.${open.kind}`)}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(null)}>
                    <div className="max-h-full w-full max-w-3xl space-y-3 overflow-auto rounded-2xl bg-card p-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold">{open.caption || t(`kind.${open.kind}`)}</span>
                            <button type="button" onClick={() => setOpen(null)} aria-label={t("close")} className="rounded-md p-2"><X size={18} /></button>
                        </div>
                        <Viewer media={open} />
                        <div className="flex flex-wrap gap-2">
                            {canManage ? (
                                <>
                                    {open.kind === "photo" && (
                                        <button type="button" onClick={() => setProfileMedia(season, teamNumber, open.id).then(() => { onProfileChange?.(open.id); toast.success(t("profileSet")); }).catch(fail)}
                                            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-border px-3 text-sm"><Star size={16} /> {t("useAsProfile")}</button>
                                    )}
                                    <CaptionEditor media={open} />
                                    <button type="button" onClick={() => remove(open)} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-border px-3 text-sm text-danger"><Trash2 size={16} /> {t("delete")}</button>
                                </>
                            ) : (
                                <button type="button" onClick={() => report(open)} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground"><Flag size={16} /> {t("report")}</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function useBlobUrl(path?: string): string | null {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!path) return;
        let cancelled = false;
        mediaBlobUrl(path).then(u => { if (!cancelled) setUrl(u); }).catch(() => {});
        return () => { cancelled = true; };
    }, [path]);
    return path ? url : null;
}

function Thumb({ media }: { media: TeamMedia }) {
    const url = useBlobUrl(media.kind === "youtube" ? undefined : media.thumbPath ?? (media.kind === "photo" ? media.path : undefined));
    if (media.kind === "youtube") return <span className="flex h-full w-full items-center justify-center text-muted-foreground"><Youtube size={28} /></span>;
    if (media.kind === "clip" && !media.thumbPath) return <span className="flex h-full w-full items-center justify-center text-muted-foreground"><Film size={28} /></span>;
    if (!url) return <span className="flex h-full w-full items-center justify-center text-muted-foreground"><Loader2 className="animate-spin" size={18} /></span>;
    // Blob URL from the Storage SDK: plain <img> (next/image can't optimize blob: URLs).
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-full w-full object-cover" />;
}

function Viewer({ media }: { media: TeamMedia }) {
    const url = useBlobUrl(media.kind === "youtube" ? undefined : media.path);
    if (media.kind === "youtube") {
        return (
            <div className="aspect-video w-full">
                <iframe className="h-full w-full rounded-lg" src={`https://www.youtube-nocookie.com/embed/${media.youtubeId}`} title={media.caption || "YouTube"}
                    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
            </div>
        );
    }
    if (!url) return <div className="flex aspect-video items-center justify-center"><Loader2 className="animate-spin" /></div>;
    if (media.kind === "clip") return <video src={url} controls playsInline className="max-h-[70vh] w-full rounded-lg bg-black/90" />;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={media.caption} className="max-h-[70vh] w-full rounded-lg object-contain" />;
}

function CaptionEditor({ media }: { media: TeamMedia }) {
    const t = useTranslations("CardMedia");
    const [value, setValue] = useState(media.caption);
    return (
        <input value={value} maxLength={MEDIA_LIMITS.captionMax} aria-label={t("captionPh")} placeholder={t("captionPh")}
            onChange={e => setValue(e.target.value)}
            onBlur={() => { if (value !== media.caption) updateCaption(media.id, value).catch(() => toast.error(t("errors.upload"))); }}
            className="min-w-[10rem] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
    );
}

/** Profile photo blob URL for the card preview (null when none or still loading). */
export function useProfilePhotoUrl(media: TeamMedia[], profileMediaId?: string | null): string | null {
    const m = media.find(x => x.id === profileMediaId && x.kind === "photo");
    return useBlobUrl(m?.path);
}
