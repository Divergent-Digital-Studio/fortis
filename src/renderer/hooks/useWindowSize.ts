import { useState, useEffect } from 'react';

interface WindowSize {
    width: number;
    height: number;
    isCollapsed: boolean;
}

const COLLAPSE_BREAKPOINT = 1000;
const DEBOUNCE_MS = 100;

function useWindowSize(): WindowSize {
    const [size, setSize] = useState<WindowSize>({
        width: window.innerWidth,
        height: window.innerHeight,
        isCollapsed: window.innerWidth < COLLAPSE_BREAKPOINT,
    });

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout>;

        const handleResize = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                setSize({
                    width: window.innerWidth,
                    height: window.innerHeight,
                    isCollapsed: window.innerWidth < COLLAPSE_BREAKPOINT,
                });
            }, DEBOUNCE_MS);
        };

        window.addEventListener('resize', handleResize);
        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return size;
}

export default useWindowSize;
export type { WindowSize };
