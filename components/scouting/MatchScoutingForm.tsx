"use client";

import { useState, useEffect } from "react";
import { useProgram } from "@/lib/stores/program-store";
import { AggregatedTeamStats, MatchScouting } from "@/types/scouting";
import FTC_IntoTheDeepForm from "./games/FTC_IntoTheDeepForm";
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

    const loadPending = async () => {
        const data = await getPendingScouting();
        setPendingData(data);
    };

    useEffect(() => {
        if (program === "FRC") {
            loadPending();
        }
    }, [program]);

    const handleScannedData = async (data: MatchScouting[]) => {
        setShowScanner(false);
        try {
            for (const item of data) {
                // Delete ID to avoid collisions and let Firebase assign
                const payload = { ...item };
                delete payload.id;
                await saveMatchScouting(payload as any);
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
                const dataToSave = { ...item };
                delete dataToSave.id;
                await saveMatchScouting(dataToSave as any);
            }
            await clearPending();
            setPendingData([]);
            toast.success("Sincronización completada");
        } catch (e) {
            toast.error("Error al sincronizar", {
                description: "Revisa tu conexión a internet",
            });
        }
    };

    let FormComponent = <div className="text-white p-6">Programa no soportado</div>;

    const programEntries = entries.filter(e => e.program === program);

    if (program === "FTC") {
        FormComponent = <FTC_IntoTheDeepForm team={team} entries={programEntries} />;
    } else if (program === "FRC") {
        FormComponent = <FRC_ReefscapeForm team={team} entries={programEntries} onSaveSuccess={loadPending} />;
    }

    return (
        <div className="space-y-8">
            {program === "FRC" && (
                <div className="flex flex-col gap-6 bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-[2rem] relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 z-10 relative">
                        <div className="flex items-center gap-5">
                            <div className="p-4 bg-cyan-500/20 text-cyan-400 rounded-2xl border border-cyan-500/30">
                                <Database size={28} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white tracking-wide">FRC Offline Hub</h2>
                                <p className="text-xs text-cyan-400 font-bold tracking-widest uppercase mt-1 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                                    {pendingData.length} Registros sin Sincronizar
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3 w-full md:w-auto">
                            {pendingData.length > 0 && (
                                <>
                                    <button
                                        onClick={() => setShowExport(!showExport)}
                                        className="flex items-center justify-center gap-2 px-6 py-3.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl border border-white/10 transition flex-1 md:flex-none"
                                    >
                                        <QrCode size={18} /> {showExport ? "Ocultar QR" : "Exportar QR"}
                                    </button>
                                    <button
                                        onClick={handleSyncLocalToCloud}
                                        className="flex items-center justify-center gap-2 px-6 py-3.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl border border-white/10 transition flex-1 md:flex-none text-nowrap"
                                    >
                                        <Send size={18} /> Sync Wi-Fi
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => setShowScanner(true)}
                                className="flex items-center justify-center gap-2 px-8 py-3.5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-black rounded-xl shadow-[0_0_30px_rgba(6,182,212,0.3)] transition flex-1 md:flex-none uppercase tracking-wider"
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
