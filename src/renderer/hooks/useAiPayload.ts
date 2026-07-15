import { useState, useCallback } from 'react';
import type { AiPayloadView } from '@shared/types/m2';

interface UseAiPayloadResult {
    payload: AiPayloadView | null;
    isLoading: boolean;
    error: string | null;
    load: () => Promise<void>;
}

function useAiPayload(): UseAiPayloadResult {
    const [payload, setPayload] = useState<AiPayloadView | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data = await window.fortis.getAiPayload();
            setPayload(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load AI payload');
        } finally {
            setIsLoading(false);
        }
    }, []);

    return { payload, isLoading, error, load };
}

export default useAiPayload;
export type { UseAiPayloadResult };
