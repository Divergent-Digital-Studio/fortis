import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { GeoConnection } from '@shared/types/m1';

interface GeoState {
    connections: GeoConnection[];
}

interface GeoActions {
    setConnections: (connections: GeoConnection[]) => void;
}

type GeoStore = GeoState & GeoActions;

export const useGeoStore = create<GeoStore>()(
    subscribeWithSelector((set) => ({
        connections: [],
        setConnections: (connections) => set({ connections }),
    })),
);
