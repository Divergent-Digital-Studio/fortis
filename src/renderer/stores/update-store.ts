import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { UpdateStatus } from '@shared/types/m4';

interface UpdateState {
    status: UpdateStatus;
    currentVersion: string;
}

interface UpdateActions {
    setStatus: (status: UpdateStatus) => void;
    setCurrentVersion: (version: string) => void;
}

type UpdateStore = UpdateState & UpdateActions;

export const useUpdateStore = create<UpdateStore>()(
    subscribeWithSelector((set) => ({
        status: { kind: 'idle' },
        currentVersion: '',
        setStatus: (status) => set({ status }),
        setCurrentVersion: (currentVersion) => set({ currentVersion }),
    })),
);
