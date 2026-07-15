import { useState, useEffect, useCallback } from 'react';
import { useFlowStore } from '../stores/flow-store';
import type { FlowGraph } from '@shared/types/m2';

interface UseFlowResult {
    graph: FlowGraph;
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

function useFlow(): UseFlowResult {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const graph = useFlowStore((s) => s.graph);
    const setGraph = useFlowStore((s) => s.setGraph);

    const fetchGraph = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data = await window.fortis.getFlowGraph();
            setGraph(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch flow graph');
        } finally {
            setIsLoading(false);
        }
    }, [setGraph]);

    useEffect(() => {
        fetchGraph();
        const unsubscribe = window.fortis.onFlowUpdate((data) => {
            setGraph(data);
        });
        return unsubscribe;
    }, [fetchGraph, setGraph]);

    return { graph, isLoading, error, refresh: fetchGraph };
}

export default useFlow;
export type { UseFlowResult };
