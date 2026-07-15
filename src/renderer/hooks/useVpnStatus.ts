import { useState, useEffect, useCallback } from 'react';
import { useVpnStore } from '../stores/vpn-store';
import type { VpnLeakStatus } from '@shared/types/m1';

interface UseVpnStatusResult {
    status: VpnLeakStatus | null;
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

function useVpnStatus(): UseVpnStatusResult {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const status = useVpnStore((s) => s.status);
    const setStatus = useVpnStore((s) => s.setStatus);

    const fetchStatus = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data = await window.fortis.getVpnStatus();
            setStatus(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch VPN status');
        } finally {
            setIsLoading(false);
        }
    }, [setStatus]);

    useEffect(() => {
        fetchStatus();
        const unsubscribe = window.fortis.onVpnUpdate((data) => {
            setStatus(data);
        });
        return unsubscribe;
    }, [fetchStatus, setStatus]);

    return { status, isLoading, error, refresh: fetchStatus };
}

export default useVpnStatus;
export type { UseVpnStatusResult };
