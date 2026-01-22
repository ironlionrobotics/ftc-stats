"use client";

import { useState, useEffect } from "react";
import { AggregatedTeamStats, ScoutingData } from "@/types/ftc";
import { Save, Edit2, AlertCircle } from "lucide-react";
import clsx from "clsx";

interface ScoutingFormProps {
    team: AggregatedTeamStats;
    initialData?: ScoutingData;
    onSave: (data: ScoutingData) => void;
}

const INITIAL_FORM_STATE: Omit<ScoutingData, 'teamNumber'> = {
    robotName: "",
    chassisType: "Mecano",
    chassisWidth: 0,
    chassisLength: 0,
    chassisUnit: "in",
    robotHeight: 0,
    canLeaveLaunchZone: "No, de ninguno",
    preferredLaunchZone: "Triángulo grande",
    autoParsings: { triangleBigRed: false, triangleSmallRed: false, triangleBigBlue: false, triangleSmallBlue: false },
    autoArtifacts: 0,
    spikeMarkSource: { near: false, medium: false, far: false, none: false },
    sensors: "Ninguno",
    organizesPattern: false,
    autoRating: 5,
    teleopFocus: "Tiros largos",
    artifactSource: { ground: false, humanPlayer: false },
    artifactsPerCycle: 0,
    cyclesCount: 0,
    endGamePreference: "Buscar el pattern",
    parkingStatus: "Robot entra completamente y no sobra espacio",
    canHang: false,
    elevationType: "",
    photoUrl: "",
    notes: ""
};

export default function ScoutingForm({ team, initialData, onSave }: ScoutingFormProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<ScoutingData>(() => initialData || { teamNumber: team.teamNumber, ...INITIAL_FORM_STATE });

    // Update form data when switching teams. Always default to View Mode (isEditing = false)
    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        } else {
            setFormData({ teamNumber: team.teamNumber, ...INITIAL_FORM_STATE });
        }
        setIsEditing(false); // Fix the "flash" and ensure read-only by default
    }, [team.teamNumber, initialData]);

    const handleChange = (field: keyof ScoutingData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleNestedChange = (parent: keyof ScoutingData, key: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            [parent]: {
                ...(prev[parent] as object),
                [key]: value
            }
        }));
    };

    const handleSave = () => {
        onSave(formData);
        setIsEditing(false);
    }

    // Helper Inputs
    const SectionTitle = ({ children }: { children: React.ReactNode }) => (
        <h3 className="text-xl font-bold text-white mt-8 mb-4 border-b border-white/10 pb-2 flex items-center gap-2">
            {children}
        </h3>
    );

    const Label = ({ children }: { children: React.ReactNode }) => (
        <label className="block text-sm font-medium text-gray-400 mb-1">{children}</label>
    );

    const Input = ({ type = "text", value, onChange, disabled = false, className = "" }: any) => (
        <input
            type={type}
            value={value}
            onChange={onChange}
            disabled={!isEditing || disabled}
            className={clsx(
                "w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all",
                className
            )}
        />
    );

    const Select = ({ value, onChange, options }: any) => (
        <select
            value={value}
            onChange={onChange}
            disabled={!isEditing}
            className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed appearance-none"
        >
            {options.map((opt: string) => <option key={opt} value={opt} className="bg-gray-900">{opt}</option>)}
        </select>
    )

    const Checkbox = ({ label, checked, onChange }: any) => (
        <label className={clsx("flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer",
            checked ? "bg-primary/20 border-primary/50" : "bg-white/5 border-white/10 hover:bg-white/10",
            !isEditing && "opacity-60 cursor-not-allowed"
        )}>
            <div className={clsx("w-5 h-5 rounded border flex items-center justify-center transition-colors", checked ? "bg-primary border-primary" : "border-gray-500")}>
                {checked && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
            </div>
            <input type="checkbox" className="hidden" checked={checked} onChange={e => isEditing && onChange(e.target.checked)} disabled={!isEditing} />
            <span className="text-sm text-gray-200">{label}</span>
        </label>
    )

    if (!team) return <div className="text-gray-400 p-8">Seleccione un equipo para comenzar.</div>;

    return (
        <div className="flex-1 bg-white/5 border border-white/10 rounded-xl overflow-hidden flex flex-col h-full md:h-auto">
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                        <span className="text-primary font-display text-3xl">{formData.teamNumber}</span>
                        {team.teamName}
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        {!isEditing ? "Modo Lectura" : "Modo Edición"}
                    </p>
                </div>

                <button
                    onClick={() => isEditing ? handleSave() : setIsEditing(true)}
                    className={clsx(
                        "px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg",
                        isEditing
                            ? "bg-green-600 hover:bg-green-500 text-white"
                            : "bg-primary hover:bg-primary/80 text-white"
                    )}
                >
                    {isEditing ? <><Save size={18} /> Guardar Cambios</> : <><Edit2 size={18} /> Editar Formulario</>}
                </button>
            </div>

            {/* Form Content */}
            <div className="p-8 overflow-y-auto custom-scrollbar space-y-8 pb-32">

                {/* ROBOT DATA */}
                <section>
                    <SectionTitle>Datos del Robot</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <Label>Nombre del Robot</Label>
                            <Input value={formData.robotName} onChange={(e: any) => handleChange('robotName', e.target.value)} />
                        </div>
                        <div>
                            <Label>Tipo de Chasis</Label>
                            <Select
                                value={formData.chassisType}
                                onChange={(e: any) => handleChange('chassisType', e.target.value)}
                                options={['Mecano', 'Tanque', 'Omnidireccional', 'Otros']}
                            />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                            <Label>Medidas del Chasis (Ancho x Largo)</Label>
                            <div className="flex gap-4 items-center">
                                <Input type="number" className="!w-32" value={formData.chassisWidth} onChange={(e: any) => handleChange('chassisWidth', Number(e.target.value))} />
                                <span className="text-gray-400">x</span>
                                <Input type="number" className="!w-32" value={formData.chassisLength} onChange={(e: any) => handleChange('chassisLength', Number(e.target.value))} />

                                <div className="flex bg-black/40 rounded-lg p-1 border border-white/10 ml-4">
                                    {['cm', 'in'].map(unit => (
                                        <button
                                            key={unit}
                                            onClick={() => isEditing && handleChange('chassisUnit', unit)}
                                            className={clsx(
                                                "px-3 py-1 rounded text-xs font-bold transition-all uppercase",
                                                formData.chassisUnit === unit ? "bg-primary text-white" : "text-gray-500",
                                                !isEditing && "cursor-default"
                                            )}
                                        >
                                            {unit}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div>
                            <Label>Altura del Robot ({formData.chassisUnit})</Label>
                            <Input type="number" value={formData.robotHeight} onChange={(e: any) => handleChange('robotHeight', Number(e.target.value))} />
                        </div>
                    </div>
                </section>

                {/* AUTONOMOUS */}
                <section>
                    <SectionTitle>Periodo Autónomo (30s)</SectionTitle>

                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <Label>¿Pueden salir del Launch Zone?</Label>
                                <Select
                                    value={formData.canLeaveLaunchZone}
                                    onChange={(e: any) => handleChange('canLeaveLaunchZone', e.target.value)}
                                    options={['No, de ninguno', 'Si, sale del triángulo grande', 'Si, sale del triángulo pequeño', 'Si, ambos']}
                                />
                            </div>
                            <div>
                                <Label>¿En cuál Launch Zone prefieren colocar el robot?</Label>
                                <Select
                                    value={formData.preferredLaunchZone}
                                    onChange={(e: any) => handleChange('preferredLaunchZone', e.target.value)}
                                    options={['Triángulo grande', 'Triángulo pequeño']}
                                />
                            </div>
                        </div>

                        <div>
                            <Label>¿Tienen autónomo para qué posición(es)?</Label>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
                                <Checkbox label="T. Grande Rojo" checked={formData.autoParsings.triangleBigRed} onChange={(v: boolean) => handleNestedChange('autoParsings', 'triangleBigRed', v)} />
                                <Checkbox label="T. Pequeño Rojo" checked={formData.autoParsings.triangleSmallRed} onChange={(v: boolean) => handleNestedChange('autoParsings', 'triangleSmallRed', v)} />
                                <Checkbox label="T. Grande Azul" checked={formData.autoParsings.triangleBigBlue} onChange={(v: boolean) => handleNestedChange('autoParsings', 'triangleBigBlue', v)} />
                                <Checkbox label="T. Pequeño Azul" checked={formData.autoParsings.triangleSmallBlue} onChange={(v: boolean) => handleNestedChange('autoParsings', 'triangleSmallBlue', v)} />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <Label>¿Cuántos artifacts anotan?</Label>
                                <Input type="number" value={formData.autoArtifacts} onChange={(e: any) => handleChange('autoArtifacts', Number(e.target.value))} />
                            </div>
                            <div>
                                <Label>Organizan artifacts para el pattern?</Label>
                                <div className="flex gap-4 mt-2">
                                    <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                                        <input type="radio" checked={formData.organizesPattern} onChange={() => isEditing && handleChange('organizesPattern', true)} disabled={!isEditing} /> Si
                                    </label>
                                    <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                                        <input type="radio" checked={!formData.organizesPattern} onChange={() => isEditing && handleChange('organizesPattern', false)} disabled={!isEditing} /> No
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div>
                            <Label>Si recogen de Spike Marks, ¿De cuáles?</Label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                                <Checkbox label="Near" checked={formData.spikeMarkSource.near} onChange={(v: boolean) => handleNestedChange('spikeMarkSource', 'near', v)} />
                                <Checkbox label="Medium" checked={formData.spikeMarkSource.medium} onChange={(v: boolean) => handleNestedChange('spikeMarkSource', 'medium', v)} />
                                <Checkbox label="Far" checked={formData.spikeMarkSource.far} onChange={(v: boolean) => handleNestedChange('spikeMarkSource', 'far', v)} />
                                <Checkbox label="No recoge" checked={formData.spikeMarkSource.none} onChange={(v: boolean) => handleNestedChange('spikeMarkSource', 'none', v)} />
                            </div>
                        </div>

                        <div>
                            <Label>¿Cuáles sensores utilizan?</Label>
                            <Select
                                value={formData.sensors}
                                onChange={(e: any) => handleChange('sensors', e.target.value)}
                                options={['Ninguno', 'Visión', 'Odometría', 'Ambos', 'Otros']}
                            />
                        </div>

                        <div>
                            <Label>Calificación del Autónomo (1-10)</Label>
                            <div className="flex items-center gap-4">
                                <input
                                    type="range"
                                    min="1" max="10"
                                    value={formData.autoRating}
                                    onChange={(e) => handleChange('autoRating', Number(e.target.value))}
                                    disabled={!isEditing}
                                    className="w-full accent-primary"
                                />
                                <span className="text-2xl font-bold text-primary w-8 text-center">{formData.autoRating}</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* TELEOP */}
                <section>
                    <SectionTitle>Tele-Op</SectionTitle>
                    <div className="space-y-6">
                        <div>
                            <Label>¿En qué se enfocan?</Label>
                            <Select
                                value={formData.teleopFocus}
                                onChange={(e: any) => handleChange('teleopFocus', e.target.value)}
                                options={['Tiros largos', 'Tiros cortos', 'Defensa / Obstrucción']}
                            />
                        </div>

                        <div>
                            <Label>¿De dónde pueden tomar artifacts?</Label>
                            <div className="flex gap-6 mt-2">
                                <Checkbox label="Suelo" checked={formData.artifactSource.ground} onChange={(v: boolean) => handleNestedChange('artifactSource', 'ground', v)} />
                                <Checkbox label="Human Player" checked={formData.artifactSource.humanPlayer} onChange={(v: boolean) => handleNestedChange('artifactSource', 'humanPlayer', v)} />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Label>¿Cuántos artifacts anotan por ciclo?</Label>
                                <Input type="number" value={formData.artifactsPerCycle} onChange={(e: any) => handleChange('artifactsPerCycle', Number(e.target.value))} />
                            </div>
                            <div>
                                <Label>¿Cuántos hacen en TeleOp?</Label>
                                <Input type="number" value={formData.cyclesCount} onChange={(e: any) => handleChange('cyclesCount', Number(e.target.value))} />
                            </div>
                        </div>
                    </div>
                </section>

                {/* ENDGAME */}
                <section>
                    <SectionTitle>End Game (30s)</SectionTitle>
                    <div className="space-y-6">
                        <div>
                            <Label>¿Qué prefieren hacer?</Label>
                            <Select
                                value={formData.endGamePreference}
                                onChange={(e: any) => handleChange('endGamePreference', e.target.value)}
                                options={['Ciclos rápidos de Artifacts', 'Buscar el pattern']}
                            />
                        </div>

                        <div>
                            <Label>¿Con qué situación se identifican en el base?</Label>
                            <Select
                                value={formData.parkingStatus}
                                onChange={(e: any) => handleChange('parkingStatus', e.target.value)}
                                options={[
                                    'Robot entra completamente y no sobra espacio',
                                    'Robot entra completo y sobran de 2 a 4 pulgadas',
                                    'Robot entra completo y sobran mas de 4 pulgadas'
                                ]}
                            />
                        </div>

                        <div className="flex flex-col md:flex-row gap-8">
                            <div>
                                <Label>¿Se elevan (Hang)?</Label>
                                <div className="flex gap-4 mt-2">
                                    <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                                        <input type="radio" checked={formData.canHang} onChange={() => isEditing && handleChange('canHang', true)} disabled={!isEditing} /> Si
                                    </label>
                                    <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                                        <input type="radio" checked={!formData.canHang} onChange={() => isEditing && handleChange('canHang', false)} disabled={!isEditing} /> No
                                    </label>
                                </div>
                            </div>
                            <div className="flex-1">
                                <Label>¿Qué tipo de elevación hacen?</Label>
                                <Select
                                    value={formData.elevationType}
                                    onChange={(e: any) => handleChange('elevationType', e.target.value)}
                                    options={['', 'Elevador', 'Giro 90 grados', 'Otros']}
                                />
                            </div>
                        </div>

                        <div>
                            <Label>Foto del Robot (URL)</Label>
                            <Input placeholder="https://..." value={formData.photoUrl} onChange={(e: any) => handleChange('photoUrl', e.target.value)} />
                        </div>
                    </div>
                </section>

            </div>
        </div>
    );
}
