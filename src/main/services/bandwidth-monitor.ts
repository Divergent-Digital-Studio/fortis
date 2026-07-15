import type { FortisEventBus } from './event-bus';
import type { BandwidthSnapshot } from '../../shared/types/m3';
import { computeDeltas, type BandwidthSample } from './bandwidth/bandwidth-delta';

export interface SampleSource {
    /** False when the platform exposes no per-process counter at all. */
    readonly supported: boolean;
    sample(): Promise<BandwidthSample[] | null>;
}

const SAMPLE_INTERVAL_MS = 5000;

/**
 * A transient sampler failure must not flip a working page to "unsupported".
 * Hold the last good rates for this long before admitting we have nothing.
 */
const STALE_AFTER_MS = SAMPLE_INTERVAL_MS * 3;

export class BandwidthMonitor {
    private timer: NodeJS.Timeout | null = null;
    private prev: BandwidthSample[] | null = null;
    private prevAt = 0;
    private current: BandwidthSnapshot;

    constructor(
        private eventBus: FortisEventBus,
        private source: SampleSource,
    ) {
        this.current = this.idle();
    }

    start(): void {
        if (this.timer) return;
        this.timer = setInterval(() => {
            void this.tick();
        }, SAMPLE_INTERVAL_MS);
        void this.tick();
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.prev = null;
        this.prevAt = 0;
        this.current = this.idle();
    }

    getCurrent(): BandwidthSnapshot {
        return this.current;
    }

    private idle(): BandwidthSnapshot {
        return {
            status: this.source.supported ? 'sampling' : 'unsupported',
            processes: [],
            sampledAt: 0,
        };
    }

    private publish(snapshot: BandwidthSnapshot): void {
        this.current = snapshot;
        this.eventBus.emit('bandwidth:updated', { snapshot });
    }

    private async tick(): Promise<void> {
        let samples: BandwidthSample[] | null;
        try {
            samples = await this.source.sample();
        } catch (err) {
            console.error('[Bandwidth] sample failed:', err);
            samples = null;
        }
        const now = Date.now();

        if (!samples) {
            if (!this.source.supported) {
                this.publish(this.idle());
                return;
            }
            if (this.current.status === 'sampling') return;
            const lastGood = this.current.status === 'ready' ? this.current.sampledAt : 0;
            if (lastGood > 0 && now - lastGood < STALE_AFTER_MS) return;
            this.publish({ status: 'sampling', processes: [], sampledAt: 0 });
            return;
        }

        if (this.prev && this.prevAt > 0) {
            const processes = computeDeltas(this.prev, samples, now - this.prevAt)
                .filter((p) => p.bytesInPerSec > 0 || p.bytesOutPerSec > 0)
                .sort(
                    (a, b) =>
                        b.bytesInPerSec + b.bytesOutPerSec - (a.bytesInPerSec + a.bytesOutPerSec),
                );
            this.publish({ status: 'ready', processes, sampledAt: now });
        }
        this.prev = samples;
        this.prevAt = now;
    }
}
