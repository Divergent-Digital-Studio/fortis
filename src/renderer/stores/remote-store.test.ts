import { describe, it, expect, beforeEach } from 'vitest';
import { useRemoteStore } from './remote-store';
import type { RemoteEventItem, RemoteServerState } from '@shared/types/m5';

const SERVER_STATE: RemoteServerState = {
    enabled: true,
    listening: true,
    host: '127.0.0.1',
    port: 47600,
    agentCount: 1,
};

function event(ts: number, summary: string): RemoteEventItem {
    return { agentId: 'agent-1', kind: 'connections', ts, summary };
}

describe('remote-store hydrate', () => {
    beforeEach(() => {
        useRemoteStore.setState({ agents: [], events: [] });
    });

    it('keeps live events that arrived before the snapshot resolved', () => {
        const live = event(300, 'live');
        useRemoteStore.getState().addEvent(live);

        useRemoteStore.getState().hydrate({
            serverState: SERVER_STATE,
            agents: [],
            lanAddress: '192.168.0.172',
            events: [event(200, 'older')],
        });

        expect(useRemoteStore.getState().events.map((e) => e.summary)).toEqual(['live', 'older']);
    });

    it('does not duplicate an event present in both the snapshot and the live feed', () => {
        const shared = event(200, 'shared');
        useRemoteStore.getState().addEvent(shared);

        useRemoteStore.getState().hydrate({
            serverState: SERVER_STATE,
            agents: [],
            lanAddress: '192.168.0.172',
            events: [shared, event(100, 'older')],
        });

        expect(useRemoteStore.getState().events.map((e) => e.summary)).toEqual(['shared', 'older']);
    });

    it('orders merged events newest-first and caps at 200', () => {
        useRemoteStore.getState().addEvent(event(1000, 'newest'));
        const snapshot = Array.from({ length: 250 }, (_, i) => event(i, `e${i}`));

        useRemoteStore.getState().hydrate({ serverState: SERVER_STATE, agents: [], lanAddress: '192.168.0.172', events: snapshot });

        const events = useRemoteStore.getState().events;
        expect(events).toHaveLength(200);
        expect(events[0]?.summary).toBe('newest');
        expect(events.map((e) => e.ts)).toEqual([...events.map((e) => e.ts)].sort((a, b) => b - a));
    });
});
