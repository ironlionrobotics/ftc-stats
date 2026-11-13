/**
 * Fixed-window counter per key, in memory. Bounded: expired windows are
 * swept when the table grows, and the table is capped so a flood of distinct
 * keys (spoofed IPs) can't grow memory without limit.
 *
 * Pure (clock injectable) — unit-tested in lib/rate-limiter.test.ts.
 */
export class FixedWindowLimiter {
    private readonly windows = new Map<string, { count: number; resetAt: number }>();

    constructor(
        private readonly max: number,
        private readonly windowSeconds: number,
        private readonly now: () => number = Date.now,
        private readonly maxKeys = 50_000,
    ) {}

    /** Counts a hit for `key`; true while the key is within its limit. */
    hit(key: string): boolean {
        const now = this.now();
        let w = this.windows.get(key);
        if (!w || w.resetAt <= now) {
            if (this.windows.size >= this.maxKeys) this.sweep(now);
            w = { count: 0, resetAt: now + this.windowSeconds * 1000 };
            this.windows.set(key, w);
        }
        w.count++;
        return w.count <= this.max;
    }

    private sweep(now: number): void {
        for (const [k, w] of this.windows) if (w.resetAt <= now) this.windows.delete(k);
        // Still full (all windows live): drop the oldest half rather than grow.
        if (this.windows.size >= this.maxKeys) {
            let drop = Math.floor(this.windows.size / 2);
            for (const k of this.windows.keys()) {
                if (drop-- <= 0) break;
                this.windows.delete(k);
            }
        }
    }

    get size(): number {
        return this.windows.size;
    }
}
