import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { InsiderThreatEvent, RestApiState, SiemState } from '@shared/types/m6';

const MAX_EVENTS = 100;

interface EnterpriseState {
    restState: RestApiState;
    siemState: SiemState;
    insiderEvents: InsiderThreatEvent[];
}
interface EnterpriseActions {
    setRestState: (s: RestApiState) => void;
    setSiemState: (s: SiemState) => void;
    setInsiderEvents: (e: InsiderThreatEvent[]) => void;
    addInsiderEvent: (e: InsiderThreatEvent) => void;
}
type EnterpriseStore = EnterpriseState & EnterpriseActions;

export const useEnterpriseStore = create<EnterpriseStore>()(
    subscribeWithSelector((set) => ({
        restState: { enabled: false, listening: false, host: '127.0.0.1', port: 47700 },
        siemState: { enabled: false, configured: false, verified: false, vendor: 'splunk', severityFloor: 'warning' },
        insiderEvents: [],
        setRestState: (restState) => set({ restState }),
        setSiemState: (siemState) => set({ siemState }),
        setInsiderEvents: (insiderEvents) => set({ insiderEvents: insiderEvents.slice(0, MAX_EVENTS) }),
        addInsiderEvent: (e) => set((s) => ({ insiderEvents: [e, ...s.insiderEvents].slice(0, MAX_EVENTS) })),
    })),
);
