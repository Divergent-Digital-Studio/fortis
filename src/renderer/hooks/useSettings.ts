import { useEffect, useCallback, useRef } from 'react';
import { useSettingsStore } from '../stores/settings-store';
import { isIpcWriteError } from '@shared/types/ipc';
import type { UserSettings } from '../types';

interface UseSettingsResult {
    settings: UserSettings;
    isLoaded: boolean;
    updateSettings: (partial: Partial<UserSettings>, sessionToken?: string) => Promise<void>;
    resetSettings: () => void;
}

function useSettings(): UseSettingsResult {
    const settings = useSettingsStore((s) => s.settings);
    const isLoaded = useSettingsStore((s) => s.isLoaded);
    const initializeSettings = useSettingsStore((s) => s.initializeSettings);
    const loadSettings = useSettingsStore((s) => s.loadSettings);
    const storeUpdateSettings = useSettingsStore((s) => s.updateSettings);
    const storeResetSettings = useSettingsStore((s) => s.resetSettings);
    const cleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        initializeSettings();

        const unsubscribe = window.fortis.onSettingsChanged((updatedSettings) => {
            loadSettings(updatedSettings);
        });

        cleanupRef.current = unsubscribe;

        return () => {
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }
        };
    }, []);

    const updateSettings = useCallback(async (partial: Partial<UserSettings>, sessionToken?: string) => {
        storeUpdateSettings(partial);
        try {
            // A rejected write resolves with {success:false,...} rather than throwing,
            // so the optimistic update must be rolled back on that too.
            const result = await window.fortis.updateSettings(partial, sessionToken);
            if (isIpcWriteError(result)) throw new Error(result.error.message);
        } catch {
            const data = await window.fortis.getSettings();
            loadSettings(data);
        }
    }, [storeUpdateSettings, loadSettings]);

    return {
        settings,
        isLoaded,
        updateSettings,
        resetSettings: storeResetSettings,
    };
}

export default useSettings;
export type { UseSettingsResult };
