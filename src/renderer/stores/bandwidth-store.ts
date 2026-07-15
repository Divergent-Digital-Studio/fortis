import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { BandwidthSnapshot } from '@shared/types/m3';
import { EMPTY_BANDWIDTH_SNAPSHOT } from '@shared/types/m3';

interface BandwidthState {
    snapshot: BandwidthSnapshot;
}

interface BandwidthActions {
    setSnapshot: (snapshot: BandwidthSnapshot) => void;
}

type BandwidthStore = BandwidthState & BandwidthActions;

export const useBandwidthStore = create<BandwidthStore>()(
    subscribeWithSelector((set) => ({
        snapshot: EMPTY_BANDWIDTH_SNAPSHOT,
        setSnapshot: (snapshot) => set({ snapshot }),
    })),
);
