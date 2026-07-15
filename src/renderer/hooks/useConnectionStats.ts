import { useState, useEffect, useCallback } from 'react';
import { useConnectionStore } from '../stores/connection-store';
import type { ConnectionStats } from '../types';

interface UseConnectionStatsResult {
    stats: ConnectionStats;
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

const POLL_INTERVAL_MS = 5000;

let subscriberCount = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;
let lastError: string | null = null;
let hasLoaded = false;
const errorListeners = new Set<(error: string | null) => void>();

function fetchStatsIntoStore(): Promise<void> {
    if (inFlight) return inFlight;

    inFlight = window.fortis
        .getConnectionStats()
        .then((data) => {
            lastError = null;
            useConnectionStore.getState().setConnectionStats(data);
        })
        .catch((err: unknown) => {
            lastError = err instanceof Error ? err.message : 'Failed to fetch stats';
        })
        .finally(() => {
            hasLoaded = true;
            inFlight = null;
            errorListeners.forEach((listener) => listener(lastError));
        });

    return inFlight;
}

function useConnectionStats(): UseConnectionStatsResult {
    const [isLoading, setIsLoading] = useState(!hasLoaded);
    const [error, setError] = useState<string | null>(lastError);
    const stats = useConnectionStore((s) => s.connectionStats);

    useEffect(() => {
        const onSettled = (fetchError: string | null): void => {
            setError(fetchError);
            setIsLoading(false);
        };
        errorListeners.add(onSettled);

        subscriberCount += 1;
        if (subscriberCount === 1) {
            fetchStatsIntoStore();
            pollTimer = setInterval(fetchStatsIntoStore, POLL_INTERVAL_MS);
        }

        return () => {
            errorListeners.delete(onSettled);
            subscriberCount -= 1;
            if (subscriberCount === 0 && pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
        };
    }, []);

    const refresh = useCallback(() => fetchStatsIntoStore(), []);

    return {
        stats,
        isLoading,
        error,
        refresh,
    };
}

export default useConnectionStats;
export type { UseConnectionStatsResult };
