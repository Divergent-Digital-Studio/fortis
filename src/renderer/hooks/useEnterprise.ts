import { useCallback, useEffect, useState } from 'react';
import { useEnterpriseStore } from '../stores/enterprise-store';
import type { InsiderThreatEvent, RestApiState, SiemState } from '@shared/types/m6';

interface UseEnterpriseResult {
    restState: RestApiState;
    siemState: SiemState;
    insiderEvents: InsiderThreatEvent[];
    error: string | null;
    dismissError: () => void;
}

function useEnterprise(): UseEnterpriseResult {
    const restState = useEnterpriseStore((s) => s.restState);
    const siemState = useEnterpriseStore((s) => s.siemState);
    const insiderEvents = useEnterpriseStore((s) => s.insiderEvents);
    const setRestState = useEnterpriseStore((s) => s.setRestState);
    const setSiemState = useEnterpriseStore((s) => s.setSiemState);
    const setInsiderEvents = useEnterpriseStore((s) => s.setInsiderEvents);
    const addInsiderEvent = useEnterpriseStore((s) => s.addInsiderEvent);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const onError = (err: unknown): void => {
            if (active) setError(err instanceof Error ? err.message : String(err));
        };
        window.fortis
            .getRestApiState()
            .then((s) => {
                if (active) setRestState(s);
            })
            .catch(onError);
        window.fortis
            .getSiemState()
            .then((s) => {
                if (active) setSiemState(s);
            })
            .catch(onError);
        window.fortis
            .getInsiderState()
            .then((s) => {
                if (active) setInsiderEvents(s.recentEvents);
            })
            .catch(onError);
        const offRest = window.fortis.onRestApiState((s: RestApiState) => setRestState(s));
        const offSiem = window.fortis.onSiemState((s: SiemState) => setSiemState(s));
        const offInsider = window.fortis.onInsiderEvent((e: InsiderThreatEvent) => addInsiderEvent(e));
        return () => {
            active = false;
            offRest();
            offSiem();
            offInsider();
        };
    }, [setRestState, setSiemState, setInsiderEvents, addInsiderEvent]);

    const dismissError = useCallback(() => setError(null), []);

    return { restState, siemState, insiderEvents, error, dismissError };
}

export default useEnterprise;
export type { UseEnterpriseResult };
