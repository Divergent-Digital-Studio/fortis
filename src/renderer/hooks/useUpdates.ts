import { useEffect, useCallback, useState } from 'react';
import { useUpdateStore } from '../stores/update-store';
import type { UpdateStatus } from '@shared/types/m4';

interface UseUpdatesResult {
    status: UpdateStatus;
    currentVersion: string;
    error: string | null;
    clearError: () => void;
    check: () => Promise<void>;
    download: () => Promise<void>;
    install: () => Promise<void>;
}

function toMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function useUpdates(): UseUpdatesResult {
    const status = useUpdateStore((s) => s.status);
    const currentVersion = useUpdateStore((s) => s.currentVersion);
    const setStatus = useUpdateStore((s) => s.setStatus);
    const setCurrentVersion = useUpdateStore((s) => s.setCurrentVersion);
    const [error, setError] = useState<string | null>(null);

    const clearError = useCallback(() => setError(null), []);

    useEffect(() => {
        let active = true;
        window.fortis
            .getAppVersion()
            .then((v) => {
                if (active) setCurrentVersion(v);
            })
            .catch((err: unknown) => {
                if (active) setError(toMessage(err));
            });
        const unsubscribe = window.fortis.onUpdateStatus((s) => setStatus(s));
        return () => {
            active = false;
            unsubscribe();
        };
    }, [setStatus, setCurrentVersion]);

    const check = useCallback(async () => {
        setError(null);
        try {
            const result = await window.fortis.checkForUpdates();
            setStatus(result);
        } catch (err) {
            setError(toMessage(err));
        }
    }, [setStatus]);

    const download = useCallback(async () => {
        setError(null);
        try {
            await window.fortis.downloadUpdate();
        } catch (err) {
            setError(toMessage(err));
        }
    }, []);

    const install = useCallback(async () => {
        setError(null);
        try {
            await window.fortis.installUpdate();
        } catch (err) {
            setError(toMessage(err));
        }
    }, []);

    return { status, currentVersion, error, clearError, check, download, install };
}

export default useUpdates;
export type { UseUpdatesResult };
