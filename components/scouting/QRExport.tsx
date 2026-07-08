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
        <div className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.05)] border border-slate-100">
            <h3 className="text-xl font-black text-slate-800 mb-6">Offline Sync QR</h3>
            <div className="bg-white p-4 rounded-xl shadow-[0_0_20px_rgba(0,0,0,0.05)] border border-slate-100">
                <QRCode value={payload} size={256} className="h-auto max-w-full" />
            </div>
            <p className="text-sm font-medium text-slate-500 mt-6 text-center max-w-xs">
                Scan this code with the Lead Scouter device to transfer <strong className="text-slate-800">{data.length}</strong> records.
            </p>
        </div>
    );
}
