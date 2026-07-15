import { useState, useRef, useEffect, useCallback } from 'react';
import type { HoverAnchor } from '../components/common/OrbitTooltip';

const CLOSE_DELAY_MS = 120;

interface OrbitHover {
    anchor: HoverAnchor | null;
    hoveredId: string | null;
    onHover: (anchor: HoverAnchor | null) => void;
}

/**
 * Hover state for an orbit's tooltip. Leaving a node closes it on a short delay,
 * so brushing across the orbit does not make it blink; landing on another node
 * cancels that close.
 */
function useOrbitHover(): OrbitHover {
    const [anchor, setAnchor] = useState<HoverAnchor | null>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cancelClose = () => {
        if (closeTimer.current !== null) {
            clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    };

    useEffect(() => cancelClose, []);

    const onHover = useCallback((next: HoverAnchor | null) => {
        cancelClose();
        if (next) {
            setAnchor(next);
            return;
        }
        closeTimer.current = setTimeout(() => setAnchor(null), CLOSE_DELAY_MS);
    }, []);

    return { anchor, hoveredId: anchor?.id ?? null, onHover };
}

export default useOrbitHover;
export type { OrbitHover };
