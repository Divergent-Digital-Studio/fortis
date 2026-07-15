import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { IotDevice } from '@shared/types/m1';

interface IotState {
    devices: IotDevice[];
}

interface IotActions {
    setDevices: (devices: IotDevice[]) => void;
}

type IotStore = IotState & IotActions;

export const useIotStore = create<IotStore>()(
    subscribeWithSelector((set) => ({
        devices: [],
        setDevices: (devices) => set({ devices }),
    })),
);
