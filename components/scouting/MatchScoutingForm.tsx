"use client";

import { useState, useEffect } from "react";
import { useProgram } from "@/lib/stores/program-store";
import { AggregatedTeamStats, MatchScouting } from "@/types/scouting";
import FTC_DecodeForm from "./games/FTC_DecodeForm";
import FRC_ReefscapeForm from "./games/FRC_ReefscapeForm";
import QRExport from "./QRExport";
import QRScanner from "./QRScanner";
import { getPendingScouting, clearPending } from "@/lib/localDatabase";
import { saveMatchScouting } from "@/lib/scouting-service";
import { Scan, Send, Database, QrCode } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface MatchScoutingFormWrapperProps {
    team: AggregatedTeamStats;
    entries: MatchScouting[];
}

export default function MatchScoutingForm({ team, entries }: MatchScoutingFormWrapperProps) {
    const { program } = useProgram();
    const confirm = useConfirm();
    const [pendingData, setPendingData] = useState<MatchScouting[]>([]);
    const [showScanner, setShowScanner] = useState(false);
    const [showExport, setShowExport] = useState(false);

    // Kept as a callable for the FRC form's onSaveSuccess (an event, where
    // setState is fine). The mount/program-change load lives in the effect below.
    const loadPending = async () => {
        const data = await getPendingScouting();
        setPendingData(data);
    };

    // Load pending entries from Dexie (external store) when FRC mode is active.
    // setState happens in the promise-resolution callback (the sanctioned effect
    // pattern), with a cancellation guard so a fast program switch can't write
    // state after unmount.
    useEffect(() => {
        if (program !== "FRC") return;
        let cancelled = false;
        getPendingScouting().then(data => {
            if (!cancelled) setPendingData(data);
        });
        return () => { cancelled = true; };
    }, [program]);

    const handleScannedData = async (data: MatchScouting[]) => {
        setShowScanner(false);
        try {
            for (const item of data) {
                // Keep the entry's own id as the Firestore doc id so re-scanning
                // the same QR is idempotent (create-if-not-exists) rather than
                // producing duplicate documents.
                await saveMatchScouting(item);
            }
            toast.success(`Sincronizados ${data.length} registros a la nube`);
        } catch (e) {
            toast.error("Error al subir los datos escaneados", {
                description: e instanceof Error ? e.message : undefined,
            });
        }
    };

    const handleSyncLocalToCloud = async () => {
        if (pendingData.length === 0) return;
        const ok = await confirm({
            title: "Subir registros a la nube",
            description: `Se enviarán ${pendingData.length} registros locales a Firestore vía Wi-Fi. Asegúrate de tener conexión estable.`,
            confirmText: "Subir",
        });
        if (!ok) return;

        try {
            for (const item of pendingData) {
                // Preserve the local id as the Firestore doc id so re-running
                // this manual sync doesn't duplicate already-uploaded entries.
                await saveMatchScouting(item);
            }
            await clearPending();
            setPendingData([]);
            toast.success("Sincronización completada");
        } catch {
            toast.error("Error al sincronizar", {
                description: "Revisa tu conexión a internet",
            });
        }
    };

    let FormComponent = <div className="text-foreground p-6">Programa no soportado</div>;

    const programEntries = entries.filter(e => e.program === program);

    if (program === "FTC") {
        FormComponent = <FTC_DecodeForm team={team} entries={programEntries} />;
    } else if (program === "FRC") {
        FormComponent = <FRC_ReefscapeForm team={team} entries={programEntries} onSaveSuccess={loadPending} />;
    }

    return (
        <div className="space-y-8">
            {program === "FRC" && (
                <div className="flex flex-col gap-6 bg-card border border-border p-6 md:p-8 rounded-[2rem] relative overflow-hidden shadow-sm">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-secondary/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 z-10 relative">
                        <div className="flex items-center gap-5">
                            <div className="p-4 bg-secondary/20 text-secondary rounded-2xl border border-secondary/30">
                                <Database size={28} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-foreground tracking-wide">FRC Offline Hub</h2>
                                <p className="text-xs text-secondary font-bold tracking-widest uppercase mt-1 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                                    {pendingData.length} Registros sin Sincronizar
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3 w-full md:w-auto">
                            {pendingData.length > 0 && (
                                <>
                                    <button
                                        onClick={() => setShowExport(!showExport)}
                                        className="flex items-center justify-center gap-2 px-6 py-3.5 bg-muted hover:bg-border text-foreground font-bold rounded-xl border border-border transition flex-1 md:flex-none"
                                    >
                                        <QrCode size={18} /> {showExport ? "Ocultar QR" : "Exportar QR"}
                                    </button>
                                    <button
                                        onClick={handleSyncLocalToCloud}
                                        className="flex items-center justify-center gap-2 px-6 py-3.5 bg-muted hover:bg-border text-foreground font-bold rounded-xl border border-border transition flex-1 md:flex-none text-nowrap"
                                    >
                                        <Send size={18} /> Sync Wi-Fi
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => setShowScanner(true)}
                                className="flex items-center justify-center gap-2 px-8 py-3.5 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-black rounded-xl transition flex-1 md:flex-none uppercase tracking-wider"
                            >
                                <Scan size={18} /> Lector QR
                            </button>
                        </div>
                    </div>

                    {showExport && pendingData.length > 0 && (
                        <div className="z-10 mt-4 animate-in fade-in slide-in-from-top-4">
                            <QRExport data={pendingData} />
                        </div>
                    )}
                </div>
            )}

            {FormComponent}

            {showScanner && <QRScanner onScan={handleScannedData} onClose={() => setShowScanner(false)} />}
        </div>
    );
}
