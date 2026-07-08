"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { MatchScouting } from "@/types/scouting";
import { Camera, X } from "lucide-react";

interface QRScannerProps {
    onScan: (data: MatchScouting[]) => void;
    onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: QRScannerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState<string>("");

    useEffect(() => {
        const codeReader = new BrowserQRCodeReader();
        let controls: any;

        const startScanning = async () => {
            try {
                if (!videoRef.current) return;
                controls = await codeReader.decodeFromVideoDevice(
                    undefined,
                    videoRef.current,
                    (result, err) => {
                        if (result) {
                            try {
                                const parsed = JSON.parse(result.getText());
                                // Array or Object validation (just checking if teamNumber exists)
                                if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].teamNumber) {
                                    onScan(parsed as MatchScouting[]);
                                } else if (parsed && parsed.teamNumber) {
                                    onScan([parsed as MatchScouting]);
                                } else {
                                    setError("Invalid QR format");
                                }
                            } catch (e) {
                                setError("Failed to parse data");
                            }
                        }
                    }
                );
            } catch (err) {
                setError("Camera access denied.");
            }
        };

        startScanning();

        return () => {
            if (controls) controls.stop();
        };
    }, [onScan]);

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur flex flex-col items-center justify-center p-6">
            <button
                onClick={onClose}
                className="absolute top-8 right-8 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition"
            >
                <X size={24} />
            </button>
            <div className="relative w-full max-w-sm aspect-square bg-slate-800 border-4 border-primary rounded-[2rem] overflow-hidden shadow-[0_0_60px_rgba(234,179,8,0.2)] flex items-center justify-center">
                <video ref={videoRef} className="w-full h-full object-cover" />
                <div className="absolute inset-0 border-[6px] border-dashed border-primary/30 m-8 rounded-xl pointer-events-none" />
                <div className="absolute top-6 left-6 bg-black/60 px-4 py-1.5 rounded-full text-white text-xs font-bold tracking-wider flex items-center gap-2">
                    <Camera size={14} /> SCANNING
                </div>
            </div>
            {error && (
                <div className="mt-8 px-6 py-3 bg-red-500/10 text-red-500 font-bold rounded-xl border border-red-500/20 shadow-sm text-sm">
                    {error}
                </div>
            )}
            <p className="mt-10 text-slate-300 font-medium text-center text-sm max-w-[250px]">
                Position the offline QR code inside the frame to sync data.
            </p>
        </div>
    );
}
