import { useState, useEffect, useCallback, useRef } from 'react';
import { useConnectionStore } from '../stores/connection-store';
import type { TimeSeriesPoint } from '../types';

interface UseConnectionTimelineResult {
    data: TimeSeriesPoint[];
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

function useConnectionTimeline(): UseConnectionTimelineResult {
    const [data, setData] = useState<TimeSeriesPoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const lastScanTimestamp = useConnectionStore((s) => s.lastScanTimestamp);
    const isMountedRef = useRef(true);

    const fetchTimeline = useCallback(async () => {
        try {
            setError(null);
            const now = Date.now();
            const from = now - ONE_HOUR_MS;
            const points = await window.fortis.getConnectionTimeline(from, now);
            if (isMountedRef.current) {
                setData(points);
            }
        } catch (err) {
            if (isMountedRef.current) {
                const message = err instanceof Error ? err.message : 'Failed to fetch timeline';
                setError(message);
                setData([]);
            }
        } finally {
            if (isMountedRef.current) {
                setIsLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        isMountedRef.current = true;
        fetchTimeline();
        return () => {
            isMountedRef.current = false;
        };
    }, [fetchTimeline]);

    useEffect(() => {
        if (lastScanTimestamp > 0) {
            fetchTimeline();
        }
    }, [lastScanTimestamp, fetchTimeline]);

    return {
        data,
        isLoading,
        error,
        refresh: fetchTimeline,
    };
}

export default useConnectionTimeline;
export type { UseConnectionTimelineResult };
