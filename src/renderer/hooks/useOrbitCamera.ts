import { useState, useRef, useEffect, useCallback } from 'react';

const AUTO_SPIN_PER_MS = 0.00012;
const MAX_PITCH = Math.PI / 2.4;
const DRAG_PER_PX = 0.006;

interface Point3 {
    x: number;
    y: number;
    z: number;
}

interface Projected {
    sx: number;
    sy: number;
    scale: number;
    z: number;
}

interface OrbitCameraOptions {
    centerX: number;
    centerY: number;
    distance: number;
    /** Idle rotation pauses while this is true, e.g. when a node is focused. */
    paused: boolean;
}

interface OrbitCamera {
    project: (point: Point3) => Projected;
    handlers: {
        onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => void;
        onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void;
        onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => void;
        onPointerCancel: (event: React.PointerEvent<SVGSVGElement>) => void;
    };
}

function useOrbitCamera({ centerX, centerY, distance, paused }: OrbitCameraOptions): OrbitCamera {
    const [yaw, setYaw] = useState(0.6);
    const [pitch, setPitch] = useState(-0.25);

    const dragRef = useRef<{ x: number; y: number } | null>(null);
    const pausedRef = useRef(paused);
    pausedRef.current = paused;

    useEffect(() => {
        let frame = 0;
        let last = performance.now();
        const tick = (now: number) => {
            const elapsed = now - last;
            last = now;
            if (!pausedRef.current && !dragRef.current) {
                setYaw((prev) => prev + elapsed * AUTO_SPIN_PER_MS);
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, []);

    // Pointer capture keeps a drag alive past the SVG's edge, but it is optional:
    // jsdom and older engines omit it, and the orbit works fine without it.
    const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
        dragRef.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    }, []);

    const onPointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        dragRef.current = { x: event.clientX, y: event.clientY };
        setYaw((prev) => prev + dx * DRAG_PER_PX);
        setPitch((prev) => Math.max(-MAX_PITCH, Math.min(MAX_PITCH, prev + dy * DRAG_PER_PX)));
    }, []);

    const endDrag = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }, []);

    const project = useCallback(
        (p: Point3): Projected => {
            const cosYaw = Math.cos(yaw);
            const sinYaw = Math.sin(yaw);
            const x1 = p.x * cosYaw + p.z * sinYaw;
            const z1 = p.z * cosYaw - p.x * sinYaw;

            const cosPitch = Math.cos(pitch);
            const sinPitch = Math.sin(pitch);
            const y2 = p.y * cosPitch - z1 * sinPitch;
            const z2 = z1 * cosPitch + p.y * sinPitch;

            const scale = distance / (distance + z2);
            return { sx: centerX + x1 * scale, sy: centerY + y2 * scale, scale, z: z2 };
        },
        [yaw, pitch, centerX, centerY, distance],
    );

    return {
        project,
        handlers: {
            onPointerDown,
            onPointerMove,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
        },
    };
}

export default useOrbitCamera;
export type { Point3, Projected, OrbitCamera };
