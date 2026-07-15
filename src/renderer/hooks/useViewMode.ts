import { useState, useCallback } from 'react';

type ViewMode = 'visual' | 'table';

const STORAGE_PREFIX = 'fortis.viewMode.';
const DEFAULT_MODES: readonly ViewMode[] = ['visual', 'table'];

function storageKey(page: string): string {
    return `${STORAGE_PREFIX}${page}`;
}

function readStored<T extends string>(page: string, allowed: readonly T[], fallback: T): T {
    try {
        const stored = localStorage.getItem(storageKey(page));
        return allowed.includes(stored as T) ? (stored as T) : fallback;
    } catch {
        return fallback;
    }
}

/** Per-page view preference, remembered across sessions. */
function useViewMode(page: string): [ViewMode, (mode: ViewMode) => void];
function useViewMode<T extends string>(
    page: string,
    allowed: readonly T[],
    fallback: T,
): [T, (mode: T) => void];
function useViewMode<T extends string>(
    page: string,
    allowed: readonly T[] = DEFAULT_MODES as readonly T[],
    fallback: T = 'visual' as T,
): [T, (mode: T) => void] {
    const [mode, setMode] = useState<T>(() => readStored(page, allowed, fallback));

    const select = useCallback(
        (next: T) => {
            setMode(next);
            try {
                localStorage.setItem(storageKey(page), next);
            } catch {
                // ponytail: a private-mode storage failure only costs the memory, not the toggle
            }
        },
        [page],
    );

    return [mode, select];
}

export default useViewMode;
export type { ViewMode };
