import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { WifiDevice } from '@shared/types/m1';

interface DeviceState {
    devices: WifiDevice[];
}

interface DeviceActions {
    setDevices: (devices: WifiDevice[]) => void;
}

type DeviceStore = DeviceState & DeviceActions;

export const useDeviceStore = create<DeviceStore>()(
    subscribeWithSelector((set) => ({
        devices: [],
        setDevices: (devices) => set({ devices }),
    })),
);
