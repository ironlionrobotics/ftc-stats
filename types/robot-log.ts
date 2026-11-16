/**
 * Robot logs uploaded by a team (decision #120, "Salud del robot"). PRIVATE to
 * the team: own-org Firestore rules, own-team Storage rules, never shared.
 * The raw CSV lives in Storage; Firestore keeps metadata + a computed summary.
 */

export type RobotLogFormat = "motor-diag" | "decode-match" | "pride-v1";

export type ChannelQuantity =
    | "voltage" | "current" | "velocity" | "position" | "power" | "loop" | "pose" | "flag" | "other";

/** Metadata of one column (values stay in the CSV / parsed log, never in Firestore). */
export interface ChannelInfo {
    /** Original CSV column name. */
    key: string;
    /** Device the column belongs to ("fl", "intake", "battery", "robot"…). */
    device: string;
    quantity: ChannelQuantity;
    /** "V", "A", "W", "ticks", "ticks/s", "ms", "cm", "deg", "%", "" … */
    unit: string;
}

export interface Channel extends ChannelInfo {
    values: number[];
}

/** A parsed, normalized log: one time axis (seconds) + channels of equal length. */
export interface RobotLog {
    format: RobotLogFormat;
    /** Seconds from the start of the run. */
    t: number[];
    channels: Channel[];
}

export type FindingCode =
    | "brownout"          // battery under BROWNOUT_V
    | "lowVoltage"        // battery under LOW_V for a while
    | "sustainedCurrent"  // a motor ≥ STALL_A for ≥ STALL_S
    | "encoderSilent"     // encoder never moved in the whole run while the motor drew current
    | "slowLoop";         // loop time spikes

export interface Finding {
    code: FindingCode;
    /** Device it refers to ("battery", "intake", "robot"). */
    device: string;
    /** Start of the episode, seconds from the start of the run. */
    atS: number;
    /** Duration of the episode in seconds (0 for instantaneous). */
    durationS: number;
    /** Main value (min V, peak A, max loop ms…). */
    value: number;
}

export interface MotorSummary {
    device: string;
    peakA: number;
    meanA: number;
    p95A: number;
    /** Whether the log carries a position/velocity channel for this motor. */
    hasEncoder: boolean;
    /** The encoder channel changed at least once during the run (false = silent or absent). */
    encoderMoved: boolean;
}

export interface RunSummary {
    /** lib/robot-logs/analysis.ts ANALYSIS_VERSION that produced it. */
    analysisVersion: number;
    durationS: number;
    samples: number;
    /** Effective sampling rate (samples / duration). */
    hz: number;
    vMin: number | null;
    vMax: number | null;
    /** Seconds spent under LOW_V. */
    lowVoltageS: number;
    totalPeakA: number | null;
    loopAvgMs: number | null;
    loopMaxMs: number | null;
    motors: MotorSummary[];
    findings: Finding[];
}

export type RobotLogKind = "match" | "practice" | "test";

/** Firestore `robot_logs/{id}`. */
export interface RobotLogDoc {
    id: string;
    orgId: string;
    season: number;
    teamNumber: number;
    createdBy: string;
    uploadedAt: number;
    /** When the run happened (from the file name or the user), ms epoch. */
    recordedAt: number;
    kind: RobotLogKind;
    eventCode: string | null;
    match: { level: string; number: number } | null;
    practiceRunId: string | null;
    label: string;
    format: RobotLogFormat;
    /** File names inside the Storage folder robot_logs/{season}/{team}/{id}/. */
    files: string[];
    channels: ChannelInfo[];
    summary: RunSummary;
}
