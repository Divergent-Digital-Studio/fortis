import { useEffect, useCallback, useState } from 'react';
import { useRemoteStore } from '../stores/remote-store';
import type { RemoteAgentInfo, RemoteEventItem, RemoteServerState } from '@shared/types/m5';

interface UseRemoteResult {
    serverState: RemoteServerState;
    agents: RemoteAgentInfo[];
    events: RemoteEventItem[];
    lanAddress: string;
    error: string | null;
    dismissError: () => void;
    setEnabled: (enabled: boolean, token?: string) => Promise<RemoteServerState>;
}

function useRemote(): UseRemoteResult {
    const serverState = useRemoteStore((s) => s.serverState);
    const agents = useRemoteStore((s) => s.agents);
    const events = useRemoteStore((s) => s.events);
    const lanAddress = useRemoteStore((s) => s.lanAddress);
    const setServerState = useRemoteStore((s) => s.setServerState);
    const setAgents = useRemoteStore((s) => s.setAgents);
    const addEvent = useRemoteStore((s) => s.addEvent);
    const hydrate = useRemoteStore((s) => s.hydrate);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        window.fortis
            .getRemoteSnapshot()
            .then((s) => {
                if (active) hydrate(s);
            })
            .catch((err: unknown) => {
                if (active) setError(err instanceof Error ? err.message : String(err));
            });
        const offState = window.fortis.onRemoteServerState((s: RemoteServerState) => setServerState(s));
        const offAgents = window.fortis.onRemoteAgents((a: RemoteAgentInfo[]) => setAgents(a));
        const offEvents = window.fortis.onRemoteEvents((e: RemoteEventItem) => addEvent(e));
        return () => {
            active = false;
            offState();
            offAgents();
            offEvents();
        };
    }, [hydrate, setServerState, setAgents, addEvent]);

    const dismissError = useCallback(() => setError(null), []);

    const setEnabled = useCallback(
        async (enabled: boolean, token?: string) => {
            const next = await window.fortis.setRemoteServerEnabled(enabled, token);
            setServerState(next);
            return next;
        },
        [setServerState],
    );

    return { serverState, agents, events, lanAddress, error, dismissError, setEnabled };
}

export default useRemote;
export type { UseRemoteResult };
