import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { VpnLeakStatus } from '@shared/types/m1';

interface VpnState {
    status: VpnLeakStatus | null;
}

interface VpnActions {
    setStatus: (status: VpnLeakStatus | null) => void;
}

type VpnStore = VpnState & VpnActions;

export const useVpnStore = create<VpnStore>()(
    subscribeWithSelector((set) => ({
        status: null,
        setStatus: (status) => set({ status }),
    })),
);
