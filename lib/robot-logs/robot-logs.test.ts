import { describe, expect, it } from "vitest";
import { parseCsv, CsvError } from "./csv";
import { parseRobotLog, detectFormat, motorDevices, classifyPrideColumn, FormatError } from "./formats";
import { summarizeRun, episodes } from "./analysis";
import { trendFlags, peakSeries } from "./trends";
import { chartRows, recordedAtFromName } from "./series";
import type { RunSummary } from "@/types/robot-log";

const MOTORS = ["fl", "fr", "bl", "br", "shooter_p", "shooter_n", "intake", "alejandro"];
const motorDiagHeader = ["time_s", "battery_volts",
    ...MOTORS.flatMap(m => [`${m}_ticks`, `${m}_current_a`, `${m}_peak_current_a`, `${m}_power_w`, `${m}_torque_pct`, `${m}_stall_warn`]),
    "total_current_a", "total_power_w"].join(",");

/** motor-diag CSV at 0.75 s; `f(i)` returns per-motor overrides for sample i. */
function motorDiag(n: number, f: (i: number) => { v?: number; cur?: Partial<Record<string, number>>; frozen?: string[] } = () => ({})): string {
    const lines = [motorDiagHeader];
    for (let i = 0; i < n; i++) {
        const o = f(i);
        const v = o.v ?? 12.5;
        const cells = [(i * 0.75).toFixed(2), v.toFixed(2)];
        let tot = 0;
        for (const m of MOTORS) {
            const a = o.cur?.[m] ?? 0.8;
            tot += a;
            const ticks = o.frozen?.includes(m) ? 0 : i * 100;
            cells.push(String(ticks), a.toFixed(2), a.toFixed(2), (a * v).toFixed(2), "5.0", "0");
        }
        cells.push(tot.toFixed(2), (tot * v).toFixed(2));
        lines.push(cells.join(","));
    }
    return lines.join("\n") + "\n";
}

const decodeHeader = "match_s,V,Vmin,I_tot,I_CH,I_EX,I_FL,I_FR,I_BL,I_BR,I_LzL,I_LzR,I_elev,I_intake,I_rest,rpm_tgt,rpm_act,rpm_LzL,rpm_LzR,vel_FL,vel_FR,vel_BL,vel_BR,vel_elev,vel_intake,f_comp,loop_ms,gate,shoot,x_cm,y_cm,h_deg";
function decode(n: number, loop: (i: number) => number = () => 12): string {
    const rows = [decodeHeader];
    for (let i = 0; i < n; i++) {
        const cols = decodeHeader.split(",").length;
        const r = new Array(cols).fill("0");
        r[0] = (i * 0.2).toFixed(1); r[1] = "12.8"; r[2] = "12.1"; r[3] = "9";
        r[6] = "1.5"; r[19] = "300"; r[26] = String(loop(i));
        rows.push(r.join(","));
    }
    return rows.join("\r\n");
}

describe("csv", () => {
    it("parses CRLF, BOM, blank lines and short rows as NaN", () => {
        const t = parseCsv("﻿a,b\r\n1,2\r\n\r\n3\r\n");
        expect(t.header).toEqual(["a", "b"]);
        expect(t.columns[0]).toEqual([1, 3]);
        expect(t.columns[1][1]).toBeNaN();
    });
    it("rejects empty files and header-only files", () => {
        expect(() => parseCsv("")).toThrow(CsvError);
        expect(() => parseCsv("a,b\n")).toThrow(/noRows/);
    });
});

describe("formats", () => {
    it("detects the three formats", () => {
        expect(detectFormat(motorDiagHeader.split(","))).toBe("motor-diag");
        expect(detectFormat(decodeHeader.split(","))).toBe("decode-match");
        expect(detectFormat(["time_s", "battery_volts", "arm_current_a"])).toBe("pride-v1");
        expect(detectFormat(["foo", "bar"])).toBeNull();
        expect(() => parseRobotLog("foo,bar\n1,2")).toThrow(FormatError);
    });
    it("classifies pride columns by suffix, longest first", () => {
        expect(classifyPrideColumn("shooter_p_peak_current_a").quantity).toBe("other");
        expect(classifyPrideColumn("shooter_p_current_a")).toMatchObject({ device: "shooter_p", quantity: "current", unit: "A" });
        expect(classifyPrideColumn("battery_volts")).toMatchObject({ device: "battery", quantity: "voltage" });
        expect(classifyPrideColumn("loop_ms")).toMatchObject({ device: "loop", quantity: "loop" });
        expect(classifyPrideColumn("gap_ms").quantity).toBe("other");
        expect(classifyPrideColumn("x_cm")).toMatchObject({ device: "pose", quantity: "pose" });
    });
    it("normalizes motor-diag: time from 0, the 8 motors, totals excluded", () => {
        const log = parseRobotLog(motorDiag(10));
        expect(log.format).toBe("motor-diag");
        expect(log.t[0]).toBe(0);
        expect(motorDevices(log)).toEqual(MOTORS);
    });
    it("normalizes DECODE match_log: hubs, rest and total are not motors", () => {
        const log = parseRobotLog(decode(20));
        expect(motorDevices(log)).toEqual(["fl", "fr", "bl", "br", "launcher_l", "launcher_r", "elevator", "intake"]);
    });
});

describe("summarizeRun", () => {
    it("a healthy run has no findings", () => {
        const s = summarizeRun(parseRobotLog(motorDiag(200)));
        expect(s.findings).toEqual([]);
        expect(s.durationS).toBeCloseTo(149.25);
        expect(s.hz).toBeCloseTo(1.33, 1);
        expect(s.vMin).toBe(12.5);
        expect(s.motors.find(m => m.device === "fl")).toMatchObject({ peakA: 0.8, hasEncoder: true, encoderMoved: true });
    });
    it("flags a brownout and a long low-voltage stretch, not a short dip", () => {
        const s = summarizeRun(parseRobotLog(motorDiag(100, i => ({
            v: i === 10 ? 9.0 : i >= 40 && i < 46 ? 10.2 : i === 70 ? 10.3 : 12.5,
        }))));
        const codes = s.findings.map(f => `${f.code}@${f.atS}`);
        expect(codes).toEqual(["brownout@7.5", "lowVoltage@30"]);
        expect(s.findings[1].durationS).toBeCloseTo(4.5);
        expect(s.vMin).toBe(9);
    });
    it("sustained current needs ≥ 1 s: one sample at 0.75 s is not enough, two are", () => {
        const one = summarizeRun(parseRobotLog(motorDiag(40, i => ({ cur: i === 5 ? { intake: 7 } : {} }))));
        expect(one.findings).toEqual([]);
        const two = summarizeRun(parseRobotLog(motorDiag(40, i => ({ cur: i === 5 || i === 6 ? { intake: 7.2 } : {} }))));
        expect(two.findings).toEqual([expect.objectContaining({ code: "sustainedCurrent", device: "intake", value: 7.2, atS: 3.75 })]);
    });
    it("a motor drawing current with an encoder that never moves is reported", () => {
        const s = summarizeRun(parseRobotLog(motorDiag(40, () => ({ frozen: ["fr"], cur: { fr: 2 } }))));
        expect(s.findings.map(f => `${f.code}:${f.device}`)).toEqual(["encoderSilent:fr"]);
        expect(s.motors.find(m => m.device === "fr")?.encoderMoved).toBe(false);
    });
    it("an idle motor without encoder movement is not reported", () => {
        const s = summarizeRun(parseRobotLog(motorDiag(40, () => ({ frozen: ["alejandro"], cur: { alejandro: 0.2 } }))));
        expect(s.findings).toEqual([]);
    });
    it("DECODE logs: loop stats and slow-loop episodes", () => {
        const s = summarizeRun(parseRobotLog(decode(50, i => (i === 20 ? 80 : 12))));
        expect(s.loopMaxMs).toBe(80);
        expect(s.findings).toEqual([expect.objectContaining({ code: "slowLoop", value: 80, atS: 4 })]);
        expect(s.totalPeakA).toBe(9);
    });
    it("survives non-monotonic time (two runs appended) without negative durations", () => {
        const text = motorDiag(10) + motorDiag(10).split("\n").slice(1).join("\n");
        const s = summarizeRun(parseRobotLog(text));
        expect(s.samples).toBe(20);
        expect(s.lowVoltageS).toBe(0);
    });
});

describe("episodes", () => {
    it("bounds a gap so one stale sample doesn't count as minutes", () => {
        const t = [0, 1, 2, 100];
        const e = episodes(t, i => i >= 2, 0);
        expect(e[0].durationS).toBe(4); // sample at 2 covers 2→100 capped to 3 × step (1 s) = 3, last sample adds one step
    });
});

const run = (peak: number, vMin = 12, loop: number | null = null, moved = true): RunSummary => ({
    analysisVersion: 1, durationS: 150, samples: 200, hz: 1.3, vMin, vMax: 13, lowVoltageS: 0, totalPeakA: 20, loopAvgMs: loop, loopMaxMs: loop,
    motors: [{ device: "intake", peakA: peak, meanA: 1, p95A: peak, hasEncoder: true, encoderMoved: moved }],
    findings: [],
});

describe("trendFlags", () => {
    it("needs 3 previous runs", () => {
        expect(trendFlags([run(4), run(4), run(9)])).toEqual([]);
    });
    it("flags current rise, voltage drop, loop rise and a lost encoder", () => {
        const flags = trendFlags([run(4, 12, 10), run(4.2, 12.1, 11), run(3.9, 11.9, 10), run(6, 11.2, 30, false)]);
        expect(flags.map(f => f.code).sort()).toEqual(["currentRise", "encoderLost", "loopRise", "voltageDrop"]);
        expect(flags.find(f => f.code === "currentRise")).toMatchObject({ value: 6, baseline: 4 });
    });
    it("ignores rises on idle motors", () => {
        expect(trendFlags([run(0.3), run(0.3), run(0.3), run(0.6)])).toEqual([]);
    });
    it("peakSeries lines up devices across runs", () => {
        expect(peakSeries([run(4), run(5)]).rows).toEqual([{ intake: 4 }, { intake: 5 }]);
    });
});

describe("series", () => {
    it("downsamples to the budget and keeps a spike of the lead channel", () => {
        const log = parseRobotLog(motorDiag(3000, i => ({ v: i === 1234 ? 8.5 : 12.5 })));
        const rows = chartRows(log, ["battery_volts", "total_current_a"], 500);
        expect(rows.length).toBeLessThanOrEqual(500);
        expect(rows.some(r => r.battery_volts === 8.5)).toBe(true);
    });
    it("reads run dates from logger names", () => {
        expect(new Date(recordedAtFromName("motor_diag_20261116_101503.csv")!).getHours()).toBe(10);
        expect(recordedAtFromName("20260721-101503_teleop")).not.toBeNull();
        expect(recordedAtFromName("log.csv")).toBeNull();
        expect(recordedAtFromName("motor_diag_20261316_101503.csv")).toBeNull();
    });
});

import { storageFileName, logFolder } from "./paths";
describe("paths", () => {
    it("file names always satisfy the Storage rule", () => {
        for (const n of ["motor_diag_20261116_101503.csv", "Match Log (2).CSV", "../../etc/passwd", "ñandú.csv", "x".repeat(80) + ".csv", ".csv"]) {
            expect(storageFileName(n)).toMatch(/^[a-z0-9_]{1,48}\.csv$/);
        }
        expect(storageFileName("Match Log (2).CSV")).toBe("match_log_2.csv");
        expect(logFolder(2026, 30311, "abc")).toBe("robot_logs/2026/30311/abc");
    });
});

describe("review hardening (#120)", () => {
    it("refuses files over MAX_ROWS instead of truncating them", () => {
        expect(() => parseCsv("a\n" + "1\n".repeat(20_001))).toThrow(/tooManyRows/);
    });
    it("drops rows without time (no NaN timestamps in findings)", () => {
        const text = motorDiag(10, i => ({ v: i === 4 ? 8.9 : 12.5 })).replace(/\n3\.00,/, "\n,");
        const s = summarizeRun(parseRobotLog(text));
        expect(s.samples).toBe(9);
        expect(s.findings.every(f => Number.isFinite(f.atS))).toBe(true);
    });
    it("an all-empty encoder column is no data, not a silent encoder", () => {
        const log = parseRobotLog("time_s,battery_volts,arm_ticks,arm_current_a\n" + Array.from({ length: 10 }, (_, i) => `${i * 0.5},12.5,,3`).join("\n"));
        const s = summarizeRun(log);
        expect(s.findings).toEqual([]);
        expect(s.motors[0]).toMatchObject({ hasEncoder: false, encoderMoved: false });
    });
    it("caps findings by severity: a late brownout survives many slow loops", () => {
        const loops = Array.from({ length: 200 }, (_, i) => `${i * 0.2},${i === 199 ? 8.5 : 12.5},${i % 2 ? 80 : 10}`);
        const s = summarizeRun(parseRobotLog("time_s,battery_volts,loop_ms\n" + loops.join("\n")));
        expect(s.findings.length).toBe(40);
        expect(s.findings.some(f => f.code === "brownout")).toBe(true);
        expect(s.analysisVersion).toBe(1);
    });
    it("no currentRise / loopRise against a zero baseline", () => {
        expect(trendFlags([run(0), run(0), run(0), run(3)])).toEqual([]);
        expect(trendFlags([run(1, 12, 0), run(1, 12, 0), run(1, 12, 0), run(1, 12, 20)])).toEqual([]);
    });
});
