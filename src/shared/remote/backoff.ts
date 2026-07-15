export interface BackoffOptions {
    baseMs?: number;
    capMs?: number;
    rng?: () => number;
}

const DEFAULT_BASE = 1000;
const DEFAULT_CAP = 30000;

export function nextBackoffDelay(attempt: number, opts: BackoffOptions = {}): number {
    const base = opts.baseMs ?? DEFAULT_BASE;
    const cap = opts.capMs ?? DEFAULT_CAP;
    const rng = opts.rng ?? Math.random;
    const ceiling = Math.min(cap, base * 2 ** attempt);
    return Math.floor(ceiling * rng());
}

export class BackoffController {
    private attempt = 0;
    constructor(private readonly opts: BackoffOptions = {}) {}

    next(): number {
        const delay = nextBackoffDelay(this.attempt, this.opts);
        this.attempt += 1;
        return delay;
    }

    reset(): void {
        this.attempt = 0;
    }

    get attempts(): number {
        return this.attempt;
    }
}
