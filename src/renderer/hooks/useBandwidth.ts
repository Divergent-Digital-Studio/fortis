import { useState, useEffect, useCallback } from 'react';
import { useBandwidthStore } from '../stores/bandwidth-store';
import type { BandwidthSnapshot } from '@shared/types/m3';

interface UseBandwidthResult {
    snapshot: BandwidthSnapshot;
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

function useBandwidth(): UseBandwidthResult {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const snapshot = useBandwidthStore((s) => s.snapshot);
    const setSnapshot = useBandwidthStore((s) => s.setSnapshot);

    const fetchBandwidth = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await window.fortis.getBandwidth();
            setSnapshot(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch bandwidth');
        } finally {
            setIsLoading(false);
        }
    }, [setSnapshot]);

    useEffect(() => {
        fetchBandwidth();
        const unsubscribe = window.fortis.onBandwidthUpdate((data) => {
            setSnapshot(data);
            setError(null);
        });
        return unsubscribe;
    }, [fetchBandwidth, setSnapshot]);

    return { snapshot, isLoading, error, refresh: fetchBandwidth };
}

export default useBandwidth;
export type { UseBandwidthResult };
