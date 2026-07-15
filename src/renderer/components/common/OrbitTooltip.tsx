import { useRef, useState, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import '../../styles/components/orbit-tooltip.css';

/** Clearance from the cursor, so the pointer never sits on top of the panel. */
const CURSOR_GAP = 16;
const MARGIN = 8;

/** Viewport coordinates of the pointer, or of the node when focused by keyboard. */
interface HoverAnchor {
    id: string;
    x: number;
    y: number;
}

interface OrbitTooltipProps {
    anchorX: number;
    anchorY: number;
    /** Changing this re-measures, so a taller body cannot overhang the viewport. */
    contentKey: string;
    children: ReactNode;
}

/** Keyboard focus has no pointer, so the node's own box anchors the tooltip. */
function anchorOfNode(node: Element, id: string): HoverAnchor {
    const rect = node.getBoundingClientRect?.();
    if (!rect) return { id, x: 0, y: 0 };
    return { id, x: rect.left + rect.width / 2, y: rect.top };
}

/**
 * A cursor-following panel for orbit nodes. Sits below-right of the pointer,
 * flips to the other side of whichever axis runs out of room, then clamps —
 * clamping is what actually guarantees it stays on screen, even when a flipped
 * position would still overhang.
 */
function OrbitTooltip({ anchorX, anchorY, contentKey, children }: OrbitTooltipProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

    useLayoutEffect(() => {
        const rect = ref.current?.getBoundingClientRect();
        const width = rect?.width ?? 0;
        const height = rect?.height ?? 0;

        const maxLeft = window.innerWidth - width - MARGIN;
        const maxTop = window.innerHeight - height - MARGIN;

        const right = anchorX + CURSOR_GAP;
        const below = anchorY + CURSOR_GAP;

        const left = right <= maxLeft ? right : anchorX - CURSOR_GAP - width;
        const top = below <= maxTop ? below : anchorY - CURSOR_GAP - height;

        setPosition({
            left: Math.max(MARGIN, Math.min(left, maxLeft)),
            top: Math.max(MARGIN, Math.min(top, maxTop)),
        });
    }, [anchorX, anchorY, contentKey]);

    // Rendered into <body>: the orbit's ancestors clip overflow, which would both
    // cut the panel off and give the view scrollbars it should never have.
    return createPortal(
        <div
            ref={ref}
            className="orbit-tooltip"
            role="tooltip"
            style={{
                left: position?.left ?? anchorX,
                top: position?.top ?? anchorY,
                visibility: position ? 'visible' : 'hidden',
            }}
        >
            {children}
        </div>,
        document.body,
    );
}

export default OrbitTooltip;
export { anchorOfNode };
export type { OrbitTooltipProps, HoverAnchor };
