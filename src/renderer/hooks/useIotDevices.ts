import { useState, useEffect, useCallback } from 'react';
import { useIotStore } from '../stores/iot-store';
import type { IotDevice } from '@shared/types/m1';

interface UseIotDevicesResult {
    devices: IotDevice[];
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

function useIotDevices(): UseIotDevicesResult {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const devices = useIotStore((s) => s.devices);
    const setDevices = useIotStore((s) => s.setDevices);

    const fetchDevices = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data = await window.fortis.getIotDevices();
            setDevices(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch IoT devices');
        } finally {
            setIsLoading(false);
        }
    }, [setDevices]);

    useEffect(() => {
        fetchDevices();
        const unsubscribe = window.fortis.onIotUpdate((data) => {
            setDevices(data);
        });
        return unsubscribe;
    }, [fetchDevices, setDevices]);

    return { devices, isLoading, error, refresh: fetchDevices };
}

export default useIotDevices;
export type { UseIotDevicesResult };
