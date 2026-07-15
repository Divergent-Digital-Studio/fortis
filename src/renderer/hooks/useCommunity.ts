import { useEffect, useCallback } from 'react';
import { useCommunityStore } from '../stores/community-store';
import type { CommunityState, ThreatIntelSubmission } from '@shared/types/m7';
import type { ThreatLevel } from '@shared/types/analysis';

interface UseCommunityResult {
    state: CommunityState;
    setEnabled: (enabled: boolean, sessionToken?: string) => Promise<CommunityState>;
    setConfig: (cfg: { endpoint: string; key: string; severityFloor: ThreatLevel }, sessionToken?: string) => Promise<CommunityState>;
    test: (endpoint: string, key: string, sessionToken?: string) => Promise<boolean>;
    preview: () => Promise<ThreatIntelSubmission[]>;
}

function useCommunity(): UseCommunityResult {
    const state = useCommunityStore((s) => s.state);
    const setState = useCommunityStore((s) => s.setState);

    useEffect(() => {
        let active = true;
        window.fortis
            .getCommunityState()
            .then((s) => {
                if (active) setState(s);
            })
            .catch(() => undefined);
        const off = window.fortis.onCommunityState((s: CommunityState) => setState(s));
        return () => {
            active = false;
            off();
        };
    }, [setState]);

    const setEnabled = useCallback(
        async (enabled: boolean, sessionToken?: string) => {
            const next = await window.fortis.setCommunityEnabled(enabled, sessionToken);
            setState(next);
            return next;
        },
        [setState],
    );

    const setConfig = useCallback(
        async (cfg: { endpoint: string; key: string; severityFloor: ThreatLevel }, sessionToken?: string) => {
            const next = await window.fortis.setCommunityConfig(cfg, sessionToken);
            setState(next);
            return next;
        },
        [setState],
    );

    const test = useCallback(
        (endpoint: string, key: string, sessionToken?: string) => window.fortis.testCommunity(endpoint, key, sessionToken),
        [],
    );

    const preview = useCallback(() => window.fortis.previewCommunityPayload(), []);

    return { state, setEnabled, setConfig, test, preview };
}

export default useCommunity;
export type { UseCommunityResult };
