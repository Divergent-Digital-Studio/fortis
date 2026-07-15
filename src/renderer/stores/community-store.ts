import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { CommunityState } from '@shared/types/m7';

const DEFAULT_STATE: CommunityState = {
    enabled: false,
    configured: false,
    verified: false,
    severityFloor: 'warning',
    submittedCount: 0,
    lastSubmittedAt: null,
};

interface CommunityStore {
    state: CommunityState;
    setState: (s: CommunityState) => void;
}

export const useCommunityStore = create<CommunityStore>()(
    subscribeWithSelector((set) => ({
        state: DEFAULT_STATE,
        setState: (state) => set({ state }),
    })),
);
