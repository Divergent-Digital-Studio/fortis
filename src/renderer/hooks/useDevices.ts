import { useState, useEffect, useCallback } from 'react';
import { useDeviceStore } from '../stores/device-store';
import type { WifiDevice } from '@shared/types/m1';

interface UseDevicesResult {
    devices: WifiDevice[];
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

function useDevices(): UseDevicesResult {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const devices = useDeviceStore((s) => s.devices);
    const setDevices = useDeviceStore((s) => s.setDevices);

    const fetchDevices = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data = await window.fortis.getDevices();
            setDevices(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch devices');
        } finally {
            setIsLoading(false);
        }
    }, [setDevices]);

    useEffect(() => {
        fetchDevices();
        const unsubscribe = window.fortis.onDevicesUpdate((data) => {
            setDevices(data);
        });
        return unsubscribe;
    }, [fetchDevices, setDevices]);

    return { devices, isLoading, error, refresh: fetchDevices };
}

export default useDevices;
export type { UseDevicesResult };
