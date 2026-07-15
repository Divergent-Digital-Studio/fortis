import { useState, useEffect, useCallback } from 'react';
import { useGeoStore } from '../stores/geo-store';
import type { GeoConnection } from '@shared/types/m1';

interface UseGeoConnectionsResult {
    connections: GeoConnection[];
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

function useGeoConnections(): UseGeoConnectionsResult {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const connections = useGeoStore((s) => s.connections);
    const setConnections = useGeoStore((s) => s.setConnections);

    const fetchConnections = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data = await window.fortis.getGeoConnections();
            setConnections(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch geo connections');
        } finally {
            setIsLoading(false);
        }
    }, [setConnections]);

    useEffect(() => {
        fetchConnections();
        const unsubscribe = window.fortis.onGeoUpdate((data) => {
            setConnections(data);
        });
        return unsubscribe;
    }, [fetchConnections, setConnections]);

    return { connections, isLoading, error, refresh: fetchConnections };
}

export default useGeoConnections;
export type { UseGeoConnectionsResult };
