import { useState, useEffect, useCallback, useRef } from 'react';
import type { AIStatusInfo, TierInfo } from '../../shared/types/ipc';
import type { AIUsageStats, AIAnalysisResult } from '../types';

interface UseAIStatusResult {
    aiStatus: AIStatusInfo | null;
    usageStats: AIUsageStats | null;
    tierInfo: TierInfo | null;
    lastAnalysis: AIAnalysisResult | null;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

const REFRESH_INTERVAL_MS = 30_000;

function useAIStatus(): UseAIStatusResult {
    const [aiStatus, setAIStatus] = useState<AIStatusInfo | null>(null);
    const [usageStats, setUsageStats] = useState<AIUsageStats | null>(null);
    const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
    const [lastAnalysis, setLastAnalysis] = useState<AIAnalysisResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchAll = useCallback(async () => {
        try {
            setError(null);
            const [status, usage, tier, analysis] = await Promise.all([
                window.fortis.getAIStatus(),
                window.fortis.getAIUsage(),
                window.fortis.getTierInfo(),
                window.fortis.getLastAnalysis(),
            ]);
            setAIStatus(status);
            setUsageStats(usage);
            setTierInfo(tier);
            if (analysis) setLastAnalysis(analysis);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch AI status';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();

        intervalRef.current = setInterval(fetchAll, REFRESH_INTERVAL_MS);

        const unsubAnalysis = window.fortis.onAnalysisUpdate((result) => {
            setLastAnalysis(result);
            fetchAll();
        });

        cleanupRef.current = unsubAnalysis;

        return () => {
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [fetchAll]);

    return {
        aiStatus,
        usageStats,
        tierInfo,
        lastAnalysis,
        loading,
        error,
        refresh: fetchAll,
    };
}

export default useAIStatus;
export type { UseAIStatusResult };
