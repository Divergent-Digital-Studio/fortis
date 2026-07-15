import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_ZOOM = 1;
const MAX_ZOOM = 12;
const ZOOM_SENSITIVITY = 0.0015;

export interface MapTransform {
    zoom: number;
    x: number;
    y: number;
}

interface UseMapTransformResult {
    transform: MapTransform;
    isPanning: boolean;
    reset: () => void;
    zoomBy: (factor: number) => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
    onPointerDown: (event: React.PointerEvent) => void;
}

const IDENTITY: MapTransform = { zoom: 1, x: 0, y: 0 };

/*
 * Pan/zoom over a viewBox of `width` x `height` user units. Translation is stored in
 * user units and clamped so the map can never be dragged away from the viewport:
 * at zoom z the visible window is (width/z) wide, leaving width - width/z to give.
 */
function clamp(transform: MapTransform, width: number, height: number): MapTransform {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, transform.zoom));
    const maxX = width * (zoom - 1);
    const maxY = height * (zoom - 1);
    return {
        zoom,
        x: Math.min(0, Math.max(-maxX, transform.x)),
        y: Math.min(0, Math.max(-maxY, transform.y)),
    };
}

function useMapTransform(width: number, height: number): UseMapTransformResult {
    const [transform, setTransform] = useState<MapTransform>(IDENTITY);
    const [isPanning, setIsPanning] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    /* Mirrors `transform` so pointer handlers read it without going stale in a closure. */
    const latest = useRef<MapTransform>(IDENTITY);
    latest.current = transform;

    const reset = useCallback(() => setTransform(IDENTITY), []);

    /* Zoom about the container centre, so the middle of the view stays put. */
    const zoomBy = useCallback(
        (factor: number) => {
            setTransform((current) => {
                const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor));
                const ratio = zoom / current.zoom;
                const centreX = width / 2;
                const centreY = height / 2;
                return clamp(
                    {
                        zoom,
                        x: centreX - (centreX - current.x) * ratio,
                        y: centreY - (centreY - current.y) * ratio,
                    },
                    width,
                    height,
                );
            });
        },
        [width, height],
    );

    /* Wheel must be a non-passive native listener; React's onWheel cannot preventDefault. */
    useEffect(() => {
        const node = containerRef.current;
        if (node === null) return undefined;

        function onWheel(event: WheelEvent) {
            event.preventDefault();
            const element = containerRef.current;
            if (element === null) return;

            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            /* Anchor the zoom on the pointer: the user unit under the cursor is invariant. */
            const pointerX = ((event.clientX - rect.left) / rect.width) * width;
            const pointerY = ((event.clientY - rect.top) / rect.height) * height;

            setTransform((current) => {
                const zoom = Math.min(
                    MAX_ZOOM,
                    Math.max(MIN_ZOOM, current.zoom * Math.exp(-event.deltaY * ZOOM_SENSITIVITY)),
                );
                const ratio = zoom / current.zoom;
                return clamp(
                    {
                        zoom,
                        x: pointerX - (pointerX - current.x) * ratio,
                        y: pointerY - (pointerY - current.y) * ratio,
                    },
                    width,
                    height,
                );
            });
        }

        node.addEventListener('wheel', onWheel, { passive: false });
        return () => node.removeEventListener('wheel', onWheel);
    }, [width, height]);

    const onPointerDown = useCallback(
        (event: React.PointerEvent) => {
            if (event.button !== 0) return;
            const element = containerRef.current;
            if (element === null) return;

            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            /* One screen pixel is this many user units, before zoom. */
            const unitsPerPixelX = width / rect.width;
            const unitsPerPixelY = height / rect.height;

            const startX = event.clientX;
            const startY = event.clientY;
            const origin = latest.current;

            setIsPanning(true);

            function onPointerMove(move: PointerEvent) {
                setTransform(
                    clamp(
                        {
                            zoom: origin.zoom,
                            x: origin.x + (move.clientX - startX) * unitsPerPixelX,
                            y: origin.y + (move.clientY - startY) * unitsPerPixelY,
                        },
                        width,
                        height,
                    ),
                );
            }

            function onPointerUp() {
                setIsPanning(false);
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
            }

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        },
        [width, height],
    );

    return { transform, isPanning, reset, zoomBy, containerRef, onPointerDown };
}

export default useMapTransform;
export { MIN_ZOOM, MAX_ZOOM };
