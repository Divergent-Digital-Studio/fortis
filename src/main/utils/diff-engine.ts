import type { NetworkConnection, ConnectionDiff } from '@shared/types';
import type { FortisEventBus } from '../services/event-bus';

export class DiffEngine {
    private eventBus: FortisEventBus;
    private previousConnections: NetworkConnection[] = [];

    constructor(eventBus: FortisEventBus) {
        this.eventBus = eventBus;
    }

    computeDiff(current: NetworkConnection[]): ConnectionDiff {
        const diff = this.buildDiff(current, this.previousConnections);

        this.previousConnections = current;

        this.emitDiffEvents(diff);

        return diff;
    }

    computeDiffWithPrevious(
        current: NetworkConnection[],
        previous: NetworkConnection[],
    ): ConnectionDiff {
        const diff = this.buildDiff(current, previous);

        this.previousConnections = current;

        this.emitDiffEvents(diff);

        return diff;
    }

    getPreviousConnections(): NetworkConnection[] {
        return [...this.previousConnections];
    }

    setPreviousConnections(connections: NetworkConnection[]): void {
        this.previousConnections = connections;
    }

    reset(): void {
        this.previousConnections = [];
    }

    private buildDiff(
        current: NetworkConnection[],
        previous: NetworkConnection[],
    ): ConnectionDiff {
        const currentMap = this.buildConnectionMap(current);
        const previousMap = this.buildConnectionMap(previous);

        const newConnections = this.detectNewConnections(currentMap, previousMap);
        const droppedConnections = this.detectDroppedConnections(currentMap, previousMap);
        const changedConnections = this.detectChangedConnections(currentMap, previousMap);

        return {
            timestamp: Date.now(),
            newConnections,
            droppedConnections,
            changedConnections,
            totalActive: current.length,
        };
    }

    private buildConnectionMap(
        connections: NetworkConnection[],
    ): Map<string, NetworkConnection[]> {
        const map = new Map<string, NetworkConnection[]>();
        for (const conn of connections) {
            const key = this.generateCompositeKey(conn);
            const bucket = map.get(key);
            if (bucket) {
                bucket.push(conn);
            } else {
                map.set(key, [conn]);
            }
        }
        return map;
    }

    private generateCompositeKey(conn: NetworkConnection): string {
        return `${conn.protocol}:${conn.localAddress}:${conn.localPort}:${conn.remoteAddress}:${conn.remotePort}:${conn.processId}`;
    }

    private detectNewConnections(
        currentMap: Map<string, NetworkConnection[]>,
        previousMap: Map<string, NetworkConnection[]>,
    ): NetworkConnection[] {
        const newConnections: NetworkConnection[] = [];

        for (const [key, currentBucket] of currentMap) {
            const previousCount = previousMap.get(key)?.length ?? 0;
            const surplus = currentBucket.length - previousCount;
            for (let i = 0; i < surplus; i++) {
                const conn = currentBucket[currentBucket.length - surplus + i];
                if (conn) newConnections.push(conn);
            }
        }

        return newConnections;
    }

    private detectDroppedConnections(
        currentMap: Map<string, NetworkConnection[]>,
        previousMap: Map<string, NetworkConnection[]>,
    ): NetworkConnection[] {
        const droppedConnections: NetworkConnection[] = [];

        for (const [key, previousBucket] of previousMap) {
            const currentCount = currentMap.get(key)?.length ?? 0;
            const surplus = previousBucket.length - currentCount;
            for (let i = 0; i < surplus; i++) {
                const conn = previousBucket[previousBucket.length - surplus + i];
                if (conn) droppedConnections.push(conn);
            }
        }

        return droppedConnections;
    }

    private detectChangedConnections(
        currentMap: Map<string, NetworkConnection[]>,
        previousMap: Map<string, NetworkConnection[]>,
    ): Array<{ before: NetworkConnection; after: NetworkConnection }> {
        const changedConnections: Array<{ before: NetworkConnection; after: NetworkConnection }> = [];

        for (const [key, currentBucket] of currentMap) {
            const previousBucket = previousMap.get(key);
            if (!previousBucket) continue;
            if (currentBucket.length !== 1 || previousBucket.length !== 1) continue;

            const currentConn = currentBucket[0];
            const previousConn = previousBucket[0];
            if (currentConn && previousConn && previousConn.state !== currentConn.state) {
                changedConnections.push({ before: previousConn, after: currentConn });
            }
        }

        return changedConnections;
    }

    private emitDiffEvents(diff: ConnectionDiff): void {
        const hasChanges =
            diff.newConnections.length > 0
            || diff.droppedConnections.length > 0
            || diff.changedConnections.length > 0;

        if (hasChanges) {
            this.eventBus.emit('diff:detected', { diff });
        } else {
            this.eventBus.emit('diff:none', { timestamp: diff.timestamp });
        }
    }
}
