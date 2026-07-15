import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { RemoteAgentInfo, RemoteEventItem, RemoteServerState, RemoteSnapshot } from '@shared/types/m5';

const MAX_EVENTS = 200;

const eventKey = (e: RemoteEventItem): string => `${e.agentId}|${e.ts}|${e.kind}|${e.summary}`;

/** Newest-first merge. The snapshot can land after live pushes have already arrived. */
function mergeEvents(snapshot: RemoteEventItem[], live: RemoteEventItem[]): RemoteEventItem[] {
    const seen = new Set(snapshot.map(eventKey));
    const merged = [...snapshot, ...live.filter((e) => !seen.has(eventKey(e)))];
    merged.sort((a, b) => b.ts - a.ts);
    return merged.slice(0, MAX_EVENTS);
}

interface RemoteState {
    serverState: RemoteServerState;
    agents: RemoteAgentInfo[];
    events: RemoteEventItem[];
    lanAddress: string;
}
interface RemoteActions {
    setServerState: (s: RemoteServerState) => void;
    setAgents: (a: RemoteAgentInfo[]) => void;
    addEvent: (e: RemoteEventItem) => void;
    hydrate: (s: RemoteSnapshot) => void;
}
type RemoteStore = RemoteState & RemoteActions;

export const useRemoteStore = create<RemoteStore>()(
    subscribeWithSelector((set) => ({
        serverState: { enabled: false, listening: false, host: '127.0.0.1', port: 47600, agentCount: 0 },
        agents: [],
        events: [],
        lanAddress: '',
        setServerState: (serverState) => set({ serverState }),
        setAgents: (agents) => set({ agents }),
        addEvent: (e) => set((s) => ({ events: [e, ...s.events].slice(0, MAX_EVENTS) })),
        hydrate: ({ serverState, agents, events, lanAddress }) =>
            set((s) => ({ serverState, agents, lanAddress, events: mergeEvents(events, s.events) })),
    })),
);
