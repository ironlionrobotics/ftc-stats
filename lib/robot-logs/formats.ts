/**
 * Log format detection + normalization (#120).
 *
 *  - `motor-diag`: MotorDiagnosticsLogger (FTC 30311 BIOBUZZ robot, the pilot):
 *    `time_s,battery_volts,<m>_ticks,<m>_current_a,<m>_peak_current_a,<m>_power_w,
 *    <m>_torque_pct,<m>_stall_warn,…,total_current_a,total_power_w`.
 *  - `pride-v1`: the generalization of motor-diag (docs/architecture/pride-log-v1.md):
 *    a `time_s` column plus `<device>_<quantity>_<unit>` columns. motor-diag is
 *    a valid pride-v1 file; it only gets its own label.
 *  - `decode-match`: 30311's DECODE `match_log.csv` (`match_s,V,Vmin,I_tot,…`).
 *
 * Everything ends up as a RobotLog: a time axis in seconds + typed channels.
 */
import type { Channel, ChannelQuantity, RobotLog, RobotLogFormat } from "@/types/robot-log";
import { parseCsv, type CsvTable } from "./csv";

export class FormatError extends Error {
    constructor(public code: "unknownFormat" | "noTime") {
        super(code);
    }
}

/** Devices that carry current but are not a single motor. */
export const NON_MOTOR_DEVICES = new Set(["total", "battery", "robot", "hub_ch", "hub_ex", "rest", "loop", "pose"]);

interface Suffix { suffix: string; quantity: ChannelQuantity; unit: string }

// Longest first: `_peak_current_a` must win over `_current_a` and `_a`.
const SUFFIXES: Suffix[] = [
    { suffix: "_peak_current_a", quantity: "other", unit: "A" }, // running peak, derived
    { suffix: "_ticks_per_s", quantity: "velocity", unit: "ticks/s" },
    { suffix: "_velocity_tps", quantity: "velocity", unit: "ticks/s" },
    { suffix: "_current_a", quantity: "current", unit: "A" },
    { suffix: "_torque_pct", quantity: "other", unit: "%" },
    { suffix: "_stall_warn", quantity: "flag", unit: "" },
    { suffix: "_power_w", quantity: "power", unit: "W" },
    { suffix: "_volts", quantity: "voltage", unit: "V" },
    { suffix: "_ticks", quantity: "position", unit: "ticks" },
    { suffix: "_rpm", quantity: "velocity", unit: "rpm" },
    { suffix: "_tps", quantity: "velocity", unit: "ticks/s" },
    { suffix: "_flag", quantity: "flag", unit: "" },
    { suffix: "_pct", quantity: "other", unit: "%" },
    { suffix: "_deg", quantity: "pose", unit: "deg" },
    { suffix: "_cm", quantity: "pose", unit: "cm" },
    { suffix: "_in", quantity: "pose", unit: "in" },
    { suffix: "_ms", quantity: "loop", unit: "ms" },
    { suffix: "_a", quantity: "current", unit: "A" },
    { suffix: "_v", quantity: "voltage", unit: "V" },
    { suffix: "_w", quantity: "power", unit: "W" },
];

/** pride-v1 / motor-diag column → channel metadata. */
export function classifyPrideColumn(key: string): Omit<Channel, "values"> {
    const k = key.toLowerCase();
    for (const s of SUFFIXES) {
        if (k.endsWith(s.suffix) && k.length > s.suffix.length) {
            let device = k.slice(0, -s.suffix.length);
            let quantity = s.quantity;
            if (s.quantity === "loop" && device !== "loop") quantity = "other"; // e.g. "gap_ms"
            if (s.quantity === "pose") device = "pose";
            if (s.quantity === "voltage" && (device === "battery" || device === "bat")) device = "battery";
            return { key, device, quantity, unit: s.unit };
        }
    }
    return { key, device: k, quantity: "other", unit: "" };
}

// DECODE match_log.csv columns (FTCDecode.matchLog / AutoOrchestrator.autoMatchLog).
const DECODE_DEVICES: Record<string, string> = {
    FL: "fl", FR: "fr", BL: "bl", BR: "br", LzL: "launcher_l", LzR: "launcher_r",
    elev: "elevator", intake: "intake", CH: "hub_ch", EX: "hub_ex", rest: "rest", tot: "total",
};

export function classifyDecodeColumn(key: string): Omit<Channel, "values"> {
    if (key === "V") return { key, device: "battery", quantity: "voltage", unit: "V" };
    if (key === "loop_ms") return { key, device: "loop", quantity: "loop", unit: "ms" };
    if (key === "x_cm" || key === "y_cm") return { key, device: "pose", quantity: "pose", unit: "cm" };
    if (key === "h_deg") return { key, device: "pose", quantity: "pose", unit: "deg" };
    if (key === "gate" || key === "shoot") return { key, device: "robot", quantity: "flag", unit: "" };
    const cur = /^I_(.+)$/.exec(key);
    if (cur && DECODE_DEVICES[cur[1]]) return { key, device: DECODE_DEVICES[cur[1]], quantity: "current", unit: "A" };
    const vel = /^vel_(.+)$/.exec(key);
    if (vel && DECODE_DEVICES[vel[1]]) return { key, device: DECODE_DEVICES[vel[1]], quantity: "velocity", unit: "ticks/s" };
    const rpm = /^rpm_(LzL|LzR)$/.exec(key);
    if (rpm) return { key, device: DECODE_DEVICES[rpm[1]], quantity: "velocity", unit: "rpm" };
    return { key, device: "robot", quantity: "other", unit: "" }; // Vmin, rpm_tgt, rpm_act, f_comp
}

export function detectFormat(header: string[]): RobotLogFormat | null {
    const h = header.map(x => x.trim());
    if (h[0] === "match_s" && h.includes("V")) return "decode-match";
    if (h[0] !== "time_s") return null;
    if (h[1] === "battery_volts" && h.some(x => x.endsWith("_stall_warn"))) return "motor-diag";
    return "pride-v1";
}

export function tableToLog(table: CsvTable): RobotLog {
    const format = detectFormat(table.header);
    if (!format) throw new FormatError("unknownFormat");
    const raw = table.columns[0];
    // Rows without a time can't be placed on the axis: drop them.
    const keep = raw.map((v, i) => (Number.isFinite(v) ? i : -1)).filter(i => i >= 0);
    if (!keep.length) throw new FormatError("noTime");
    const t0 = raw[keep[0]];
    const t = keep.map(i => raw[i] - t0);
    const classify = format === "decode-match" ? classifyDecodeColumn : classifyPrideColumn;
    const channels: Channel[] = table.header.slice(1).map((key, c) => ({ ...classify(key), values: keep.map(i => table.columns[c + 1][i]) }));
    return { format, t, channels };
}

/** CSV text → normalized log. Throws CsvError / FormatError (codes for i18n). */
export function parseRobotLog(text: string): RobotLog {
    return tableToLog(parseCsv(text));
}

/** Motor devices present in the log (have a current channel and aren't aggregates). */
export function motorDevices(log: RobotLog): string[] {
    const out: string[] = [];
    for (const c of log.channels) {
        if (c.quantity === "current" && !NON_MOTOR_DEVICES.has(c.device) && !out.includes(c.device)) out.push(c.device);
    }
    return out;
}

export function findChannel(log: RobotLog, device: string, quantity: ChannelQuantity): Channel | undefined {
    return log.channels.find(c => c.device === device && c.quantity === quantity);
}
