import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { UserSettings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';

interface SettingsState {
    settings: UserSettings;
    isLoaded: boolean;
}

interface SettingsActions {
    updateSettings: (partial: Partial<UserSettings>) => void;
    loadSettings: (settings: UserSettings) => void;
    resetSettings: () => void;
    initializeSettings: () => Promise<void>;
}

type SettingsStore = SettingsState & SettingsActions;

export const useSettingsStore = create<SettingsStore>()(
    subscribeWithSelector((set) => ({
        settings: { ...DEFAULT_SETTINGS },
        isLoaded: false,

        updateSettings: (partial) =>
            set((state) => ({
                settings: { ...state.settings, ...partial },
            })),

        loadSettings: (settings) =>
            set({
                settings,
                isLoaded: true,
            }),

        resetSettings: () =>
            set({
                settings: { ...DEFAULT_SETTINGS },
            }),

        initializeSettings: async () => {
            try {
                const data = await window.fortis.getSettings();
                set({ settings: data, isLoaded: true });
            } catch {
                set({ isLoaded: true });
            }
        },
    })),
);

export const selectTier = (state: SettingsStore) => state.settings.tier;
export const selectIsLoaded = (state: SettingsStore) => state.isLoaded;
