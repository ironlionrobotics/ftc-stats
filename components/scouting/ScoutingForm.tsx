"use client";

import { useState, useEffect } from "react";
import { AggregatedTeamStats, PitScouting } from "@/types/ftc";
import { Save, Edit2, AlertCircle } from "lucide-react";
import clsx from "clsx";

interface ScoutingFormProps {
    team: AggregatedTeamStats;
    initialData?: PitScouting;
    onSave: (data: PitScouting) => void;
}

const INITIAL_FORM_STATE: Omit<PitScouting, 'teamNumber' | 'season'> = {
    robotName: "",
    driveTrain: "Mecano",
    dimensions: "",
    weight: "",
    motors: "",
    sensors: "",
    servoCount: 0,
    intakeType: "Fricción",
    scoringMechanism: "Lanzador",
    patternMechanism: "Rampa",
    visionSensors: [],
    canDualPark: false,
    motifDetection: false,
    photoUrl: "",
    notes: ""
};

export default function ScoutingForm({ team, initialData, onSave }: ScoutingFormProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<PitScouting>(() => initialData || { teamNumber: team.teamNumber, season: 2025, ...INITIAL_FORM_STATE });

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        } else {
            setFormData({ teamNumber: team.teamNumber, season: 2025, ...INITIAL_FORM_STATE });
        }
        setIsEditing(false);
    }, [team.teamNumber, initialData]);

    const handleChange = (field: keyof PitScouting, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        onSave(formData);
        setIsEditing(false);
    }

    const SectionTitle = ({ children }: { children: React.ReactNode }) => (
        <h3 className="text-xl font-bold text-white mt-4 mb-4 border-b border-white/10 pb-2 flex items-center gap-2">
            {children}
        </h3>
    );

    const Label = ({ children }: { children: React.ReactNode }) => (
        <label className="block text-sm font-medium text-gray-400 mb-1">{children}</label>
    );

    const Input = ({ type = "text", value, onChange, disabled = false, className = "", placeholder = "" }: any) => (
        <input
            type={type}
            value={value || ""}
            onChange={onChange}
            disabled={!isEditing || disabled}
            placeholder={placeholder}
            className={clsx(
                "w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all",
                className
            )}
        />
    );

    const Select = ({ value, onChange, options, className = "" }: any) => (
        <select
            value={value}
            onChange={onChange}
            disabled={!isEditing}
            className={clsx(
                "px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed appearance-none w-full",
                className
            )}
        >
            {options.map((opt: string) => <option key={opt} value={opt} className="bg-gray-900">{opt}</option>)}
        </select>
    )

    return (
        <div className="flex-1 bg-white/5 border border-white/10 rounded-xl overflow-hidden flex flex-col h-full">
            {/* Header */}
            <div className="px-6 py-3 border-b border-white/10 flex justify-between items-center bg-black/20">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                            <span className="text-primary font-display text-3xl">{team.teamNumber}</span>
                            {team.teamName}
                        </h2>
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Temporada 2025: DECODE</span>
                    </div>
                    <span className={clsx(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                        !isEditing ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-green-500/10 border-green-500/30 text-green-400"
                    )}>
                        {!isEditing ? "Lectura" : "Edición"}
                    </span>
                </div>

                <button
                    onClick={() => isEditing ? handleSave() : setIsEditing(true)}
                    className={clsx(
                        "px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg",
                        isEditing ? "bg-green-600 hover:bg-green-500 text-white" : "bg-primary hover:bg-primary/80 text-white"
                    )}
                >
                    {isEditing ? <><Save size={18} /> Guardar Pit Data</> : <><Edit2 size={18} /> Editar Pit Data</>}
                </button>
            </div>

            <div className="p-6 md:p-8 pt-0 overflow-y-auto custom-scrollbar space-y-8 pb-16">
                <section>
                    <SectionTitle>Especificaciones Técnicas</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div>
                            <Label>Nombre del Robot</Label>
                            <Input value={formData.robotName} onChange={(e: any) => handleChange('robotName', e.target.value)} placeholder="Ej: Iron Lion Bot" />
                        </div>
                        <div>
                            <Label>Tipo de Tracción</Label>
                            <Select
                                value={formData.driveTrain}
                                onChange={(e: any) => handleChange('driveTrain', e.target.value)}
                                options={['Mecanno', 'X-Drive', 'Tanque', 'Omnidireccional', 'Swerve', 'Otros']}
                            />
                        </div>
                        <div>
                            <Label>Cantidad de Servos (Max 10)</Label>
                            <Input type="number" value={formData.servoCount} onChange={(e: any) => handleChange('servoCount', parseInt(e.target.value))} />
                        </div>
                        <div>
                            <Label>Dimensiones (Pulgadas)</Label>
                            <Input value={formData.dimensions} onChange={(e: any) => handleChange('dimensions', e.target.value)} placeholder="Ej: 18x18x18" />
                        </div>
                        <div>
                            <Label>Peso (Kg)</Label>
                            <Input value={formData.weight} onChange={(e: any) => handleChange('weight', e.target.value)} placeholder="Ej: 12.5" />
                        </div>
                        <div>
                            <Label>Motores</Label>
                            <Input value={formData.motors} onChange={(e: any) => handleChange('motors', e.target.value)} placeholder="Ej: 4 Rev HD Hex" />
                        </div>
                    </div>
                </section>

                <section>
                    <SectionTitle>Mecanismos de Artifacts & Patterns</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div>
                            <Label>Tipo de Intake</Label>
                            <Select
                                value={formData.intakeType}
                                onChange={(e: any) => handleChange('intakeType', e.target.value)}
                                options={['Fricción (Ruedas)', 'Garra', 'Succión', 'Activo-Vertical', 'Otro']}
                            />
                        </div>
                        <div>
                            <Label>Mecanismo Scoring (Goal)</Label>
                            <Select
                                value={formData.scoringMechanism}
                                onChange={(e: any) => handleChange('scoringMechanism', e.target.value)}
                                options={['Lanzador', 'Elevador/Depósito', 'Rampa Directa', 'Otro']}
                            />
                        </div>
                        <div>
                            <Label>Mecanismo de Patrones (Ramp)</Label>
                            <Input value={formData.patternMechanism} onChange={(e: any) => handleChange('patternMechanism', e.target.value)} placeholder="Ej: Rampa con Gates" />
                        </div>
                    </div>
                </section>

                <section>
                    <SectionTitle>Capacidades de Juego & Visión</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4 bg-white/5 p-4 rounded-xl border border-white/10">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input type="checkbox" checked={formData.motifDetection} onChange={e => handleChange('motifDetection', e.target.checked)} disabled={!isEditing} className="w-5 h-5 accent-primary" />
                                <span className="text-white font-medium">¿Detecta Motif (Visión)?</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input type="checkbox" checked={formData.canDualPark} onChange={e => handleChange('canDualPark', e.target.checked)} disabled={!isEditing} className="w-5 h-5 accent-primary" />
                                <span className="text-white font-medium">¿Permite Dual Parking (18x18)?</span>
                            </label>
                        </div>
                        <div>
                            <Label>Sensores / Cámaras</Label>
                            <Input value={formData.sensors} onChange={(e: any) => handleChange('sensors', e.target.value)} placeholder="Ej: Webcam C920, Sensores de color" />
                        </div>
                    </div>
                </section>

                <section>
                    <SectionTitle>Notas y Fotos</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-1">
                            <Label>URL de la Foto</Label>
                            <Input value={formData.photoUrl} onChange={(e: any) => handleChange('photoUrl', e.target.value)} placeholder="https://..." />
                        </div>
                        <div className="md:col-span-2">
                            <Label>Notas Generales de Estrategia</Label>
                            <textarea
                                value={formData.notes || ""}
                                onChange={(e) => handleChange('notes', e.target.value)}
                                disabled={!isEditing}
                                className="w-full h-32 px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                                placeholder="Debilidades, fortalezas, estilo de conducción..."
                            />
                        </div>
                    </div>
                </section>

                {formData.lastUpdatedBy && (
                    <p className="text-xs text-gray-500 italic">
                        Última actualización por {formData.lastUpdatedBy}
                    </p>
                )}
            </div>
        </div>
    );
}
