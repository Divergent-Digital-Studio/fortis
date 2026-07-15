import { useState, useEffect, useCallback } from 'react';
import { useDnsStore } from '../stores/dns-store';
import type { DnsQueryRecord } from '@shared/types/m1';

interface UseDnsQueriesResult {
    records: DnsQueryRecord[];
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

function useDnsQueries(): UseDnsQueriesResult {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const records = useDnsStore((s) => s.records);
    const setRecords = useDnsStore((s) => s.setRecords);

    const fetchRecords = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data = await window.fortis.getDnsQueries();
            setRecords(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch DNS queries');
        } finally {
            setIsLoading(false);
        }
    }, [setRecords]);

    useEffect(() => {
        fetchRecords();
        const unsubscribe = window.fortis.onDnsUpdate((data) => {
            setRecords(data);
        });
        return unsubscribe;
    }, [fetchRecords, setRecords]);

    return { records, isLoading, error, refresh: fetchRecords };
}

export default useDnsQueries;
export type { UseDnsQueriesResult };
