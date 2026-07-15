import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { ViewType } from '../../shared/types';

interface UIState {
    activeView: ViewType;
    sidebarCollapsed: boolean;
    licenseDialogOpen: boolean;
}

interface UIActions {
    setActiveView: (view: ViewType) => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    setLicenseDialogOpen: (open: boolean) => void;
}

type UIStore = UIState & UIActions;

export const useUIStore = create<UIStore>()(
    subscribeWithSelector((set) => ({
        activeView: 'overview',
        sidebarCollapsed: false,
        licenseDialogOpen: false,

        setActiveView: (activeView) => set({ activeView }),

        setSidebarCollapsed: (sidebarCollapsed) =>
            set({ sidebarCollapsed }),

        setLicenseDialogOpen: (licenseDialogOpen) => set({ licenseDialogOpen }),
    })),
);
