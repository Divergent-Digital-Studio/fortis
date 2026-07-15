export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitOpenError extends Error {
    readonly state: CircuitState;
    readonly retryAfterMs: number;

    constructor(name: string, retryAfterMs: number) {
        super(`Circuit breaker "${name}" is OPEN. Retry after ${retryAfterMs}ms.`);
        this.name = 'CircuitOpenError';
        this.state = 'OPEN';
        this.retryAfterMs = retryAfterMs;
    }
}

export class RateLimitError extends Error {
    readonly remainingCalls: number;
    readonly resetAtMs: number;

    constructor(name: string, resetAtMs: number) {
        super(`Circuit breaker "${name}" rate limit exceeded. Resets at ${new Date(resetAtMs).toISOString()}.`);
        this.name = 'RateLimitError';
        this.remainingCalls = 0;
        this.resetAtMs = resetAtMs;
    }
}

interface CircuitBreakerOptions {
    failureThreshold?: number;
    resetTimeoutMs?: number;
    name?: string;
    maxCallsPerHour?: number;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_CALLS_PER_HOUR = 60;
const ONE_HOUR_MS = 60 * 60 * 1000;

export class CircuitBreaker {
    private readonly failureThreshold: number;
    private readonly resetTimeoutMs: number;
    private readonly maxCallsPerHour: number;
    private readonly label: string;

    private state: CircuitState = 'CLOSED';
    private consecutiveFailures = 0;
    private lastFailureTime = 0;
    private openedAt = 0;
    private callTimestamps: number[] = [];
    private halfOpenProbeInFlight = false;

    constructor(options?: CircuitBreakerOptions) {
        this.failureThreshold = options?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
        this.resetTimeoutMs = options?.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS;
        this.maxCallsPerHour = options?.maxCallsPerHour ?? DEFAULT_MAX_CALLS_PER_HOUR;
        this.label = options?.name ?? 'default';
    }

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        this.applyStateTransition();

        if (this.state === 'OPEN') {
            const retryAfter = this.openedAt + this.resetTimeoutMs - Date.now();
            throw new CircuitOpenError(this.label, Math.max(0, retryAfter));
        }

        if (this.state === 'HALF_OPEN') {
            if (this.halfOpenProbeInFlight) {
                const retryAfter = this.openedAt + this.resetTimeoutMs - Date.now();
                throw new CircuitOpenError(this.label, Math.max(0, retryAfter));
            }
            this.halfOpenProbeInFlight = true;
        }

        this.enforceRateLimit();

        this.recordCall();

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        } finally {
            this.halfOpenProbeInFlight = false;
        }
    }

    getState(): CircuitState {
        return this.computeState();
    }

    reset(): void {
        this.state = 'CLOSED';
        this.consecutiveFailures = 0;
        this.lastFailureTime = 0;
        this.openedAt = 0;
        this.halfOpenProbeInFlight = false;
    }

    getFailureCount(): number {
        return this.consecutiveFailures;
    }

    getLastFailureTime(): number {
        return this.lastFailureTime;
    }

    getRemainingCalls(): number {
        this.pruneOldTimestamps();
        return Math.max(0, this.maxCallsPerHour - this.callTimestamps.length);
    }

    getName(): string {
        return this.label;
    }

    private computeState(): CircuitState {
        if (this.state !== 'OPEN') {
            return this.state;
        }

        const elapsed = Date.now() - this.openedAt;
        if (elapsed >= this.resetTimeoutMs) {
            return 'HALF_OPEN';
        }

        return 'OPEN';
    }

    private applyStateTransition(): void {
        this.state = this.computeState();
    }

    private onSuccess(): void {
        if (this.state === 'HALF_OPEN') {
            this.state = 'CLOSED';
        }
        this.consecutiveFailures = 0;
    }

    private onFailure(): void {
        this.consecutiveFailures++;
        this.lastFailureTime = Date.now();

        if (this.state === 'HALF_OPEN') {
            this.tripOpen();
            return;
        }

        if (this.consecutiveFailures >= this.failureThreshold) {
            this.tripOpen();
        }
    }

    private tripOpen(): void {
        this.state = 'OPEN';
        this.openedAt = Date.now();
    }

    private enforceRateLimit(): void {
        this.pruneOldTimestamps();

        if (this.callTimestamps.length >= this.maxCallsPerHour) {
            const oldestTimestamp = this.callTimestamps[0]!;
            const resetAt = oldestTimestamp + ONE_HOUR_MS;
            throw new RateLimitError(this.label, resetAt);
        }
    }

    private recordCall(): void {
        this.callTimestamps.push(Date.now());
    }

    private pruneOldTimestamps(): void {
        const cutoff = Date.now() - ONE_HOUR_MS;
        this.callTimestamps = this.callTimestamps.filter((ts) => ts > cutoff);
    }
}
