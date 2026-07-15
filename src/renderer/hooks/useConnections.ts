import { useState, useEffect, useCallback } from 'react';
import { useConnectionStore } from '../stores/connection-store';
import type { NetworkConnection } from '../types';

interface UseConnectionsResult {
    connections: NetworkConnection[];
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

function useConnections(): UseConnectionsResult {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);


    const connections = useConnectionStore((s) => s.connections);
    const setConnections = useConnectionStore((s) => s.setConnections);
    const setScanStatus = useConnectionStore((s) => s.setScanStatus);
    const setLastScanTimestamp = useConnectionStore((s) => s.setLastScanTimestamp);

    const fetchConnections = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            setScanStatus('scanning');
            const data = await window.fortis.getConnections();
            setConnections(data);
            setLastScanTimestamp(Date.now());
            setScanStatus('idle');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch connections';
            setError(message);
            setScanStatus('error');
        } finally {
            setIsLoading(false);
        }
    }, [setConnections, setScanStatus, setLastScanTimestamp]);

    useEffect(() => {
        fetchConnections();
    }, [fetchConnections]);

    return {
        connections,
        isLoading,
        error,
        refresh: fetchConnections,
    };
}

export default useConnections;
export type { UseConnectionsResult };
