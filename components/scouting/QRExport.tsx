"use client";

import { useMemo } from "react";
import QRCode from "react-qr-code";
import { MatchScouting } from "@/types/scouting";

interface QRExportProps {
    data: MatchScouting[];
}

export default function QRExport({ data }: QRExportProps) {
    const payload = useMemo(() => {
        // We compress or just stringify the JSON
        // If it's too large, QRCode might be dense.
        // For simple scouting entries, JSON string should fit in a standard QR.
        return JSON.stringify(data);
    }, [data]);

    return (
        <div className="flex flex-col items-center justify-center p-6 bg-card rounded-2xl shadow-sm border border-border">
            <h3 className="text-xl font-black text-foreground mb-6">Offline Sync QR</h3>
            {/* Stays bg-white regardless of theme: the QRCode component renders dark
                modules against a light backdrop, so this container's contrast is
                functional (scannability), not decorative. */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <QRCode value={payload} size={256} className="h-auto max-w-full" />
            </div>
            <p className="text-sm font-medium text-muted-foreground mt-6 text-center max-w-xs">
                Scan this code with the Lead Scouter device to transfer <strong className="text-foreground">{data.length}</strong> records.
            </p>
        </div>
    );
}
