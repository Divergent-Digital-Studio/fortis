import { create } from 'zustand';
import type { LicenseStatus } from '@shared/types/settings';
import { FREE_LICENSE_STATUS } from './license-defaults';

interface LicenseState {
    status: LicenseStatus;
    setStatus: (status: LicenseStatus) => void;
}

const useLicenseStore = create<LicenseState>((set) => ({
    status: { ...FREE_LICENSE_STATUS },
    setStatus: (status) => set({ status }),
}));

export { useLicenseStore };
