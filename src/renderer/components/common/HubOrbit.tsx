import { useMemo } from 'react';
import useOrbitCamera, { type Point3 } from '../../hooks/useOrbitCamera';
import { anchorOfNode, type HoverAnchor } from './OrbitTooltip';
import '../../styles/components/hub-orbit.css';

const VIEW_W = 1200;
const VIEW_H = 820;
const CENTER_X = VIEW_W / 2;
const CENTER_Y = VIEW_H / 2;
const CAMERA_DISTANCE = 1500;

const INNER_RADIUS = 240;
const OUTER_RADIUS = 430;
const RING_TILT = 120;
const HUB_RADIUS = 22;
const MIN_NODE_RADIUS = 8;
const MAX_NODE_GROWTH = 8;
const RING_SEGMENTS = 72;

/**
 * Above this, a ring gives each node under ~5° of arc and the labels collide.
 * Past it the nodes spread over a sphere instead, which has room for far more.
 */
const RING_CAPACITY = 24;

/** Labels drawn at once. Beyond this the canvas is text, not a diagram. */
const MAX_LABELS = 18;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** One point on the orbit: a remote endpoint reached from this machine. */
interface HubNode {
    id: string;
    label: string;
    /** Drives node size relative to the busiest node. */
    weight: number;
    /** Outer ring when true, inner ring otherwise. */
    outer: boolean;
    tone?: 'default' | 'warning';
}

interface HubOrbitProps {
    nodes: readonly HubNode[];
    hubLabel: string;
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    ariaLabel: string;
    /** Omit to skip hover tracking entirely; the orbit then only pauses on select. */
    onHover?: (anchor: HoverAnchor | null) => void;
    hoveredId?: string | null;
}

function ringPointAt(angle: number, radius: number): Point3 {
    return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle * 2) * (RING_TILT / 2),
        z: Math.sin(angle) * radius,
    };
}

/** Two coaxial tilted rings, so a full orbit separates neighbours seen edge-on. */
function layoutRings(nodes: readonly HubNode[]): Map<string, Point3> {
    const positions = new Map<string, Point3>();

    for (const outer of [false, true]) {
        const group = nodes.filter((node) => node.outer === outer);
        const radius = outer ? OUTER_RADIUS : INNER_RADIUS;
        const phase = outer ? Math.PI / 6 : 0;

        group.forEach((node, index) => {
            const angle = (index / Math.max(group.length, 1)) * Math.PI * 2 + phase;
            positions.set(node.id, ringPointAt(angle, radius));
        });
    }

    return positions;
}

/**
 * Fibonacci sphere: successive points step by the golden angle, so they never
 * line up into the spokes or clumps an evenly-divided ring produces. A crowded
 * set gets uniform spacing in three dimensions instead of one.
 */
function layoutSpheres(nodes: readonly HubNode[]): Map<string, Point3> {
    const positions = new Map<string, Point3>();

    for (const outer of [false, true]) {
        const group = nodes.filter((node) => node.outer === outer);
        if (group.length === 0) continue;
        const radius = outer ? OUTER_RADIUS : INNER_RADIUS;

        group.forEach((node, index) => {
            // y sweeps pole to pole; the radius of that latitude follows.
            const y = group.length === 1 ? 0 : 1 - (index / (group.length - 1)) * 2;
            const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = GOLDEN_ANGLE * index;
            positions.set(node.id, {
                x: Math.cos(theta) * ringRadius * radius,
                y: y * radius,
                z: Math.sin(theta) * ringRadius * radius,
            });
        });
    }

    return positions;
}

function ringPath(radius: number, phase: number, project: (p: Point3) => { sx: number; sy: number }): string {
    const points: string[] = [];
    for (let i = 0; i <= RING_SEGMENTS; i += 1) {
        const angle = (i / RING_SEGMENTS) * Math.PI * 2 + phase;
        const { sx, sy } = project(ringPointAt(angle, radius));
        points.push(`${i === 0 ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)}`);
    }
    return points.join(' ');
}

/**
 * A hub-and-spoke orbit: this machine at the centre, remote endpoints on two
 * rings around it. Shared by every page whose data is "us talking to them".
 */
function HubOrbit({
    nodes,
    hubLabel,
    selectedId,
    onSelect,
    ariaLabel,
    onHover,
    hoveredId = null,
}: HubOrbitProps) {
    // Hovering freezes the orbit so the node under the cursor stops moving while
    // its tooltip is read, exactly as a selection does.
    const focused = selectedId ?? hoveredId;

    const { project, handlers } = useOrbitCamera({
        centerX: CENTER_X,
        centerY: CENTER_Y,
        distance: CAMERA_DISTANCE,
        paused: focused !== null,
    });

    const crowded = nodes.length > RING_CAPACITY;

    const rings = useMemo(
        () => (crowded ? layoutSpheres(nodes) : layoutRings(nodes)),
        [nodes, crowded],
    );
    const maxWeight = useMemo(() => nodes.reduce((max, node) => Math.max(max, node.weight), 0), [nodes]);

    // Only the heaviest nodes carry a label; the rest would overlap into noise.
    // Everything keeps its <title>, so hover and screen readers still name it.
    const labelled = useMemo(() => {
        if (nodes.length <= MAX_LABELS) return null;
        const top = [...nodes].sort((a, b) => b.weight - a.weight).slice(0, MAX_LABELS);
        return new Set(top.map((node) => node.id));
    }, [nodes]);

    const hub = project({ x: 0, y: 0, z: 0 });

    const placed = useMemo(
        () =>
            nodes
                .map((node) => {
                    const point = rings.get(node.id);
                    return point ? { node, projected: project(point) } : null;
                })
                .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
                // Painter's algorithm: far nodes first so near ones overlap them.
                .sort((a, b) => b.projected.z - a.projected.z),
        [nodes, rings, project],
    );

    const radiusFor = (weight: number): number =>
        maxWeight <= 0 ? MIN_NODE_RADIUS : MIN_NODE_RADIUS + (weight / maxWeight) * MAX_NODE_GROWTH;

    // A focused node names itself even when it is too light to make the cut.
    const showLabel = (node: HubNode): boolean =>
        labelled === null || node.id === focused || labelled.has(node.id);

    return (
        <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="hub-orbit__svg"
            preserveAspectRatio="xMidYMid meet"
            aria-label={ariaLabel}
            {...handlers}
            onClick={(event) => {
                if (event.target === event.currentTarget) onSelect(null);
            }}
        >
            {/* The guide rings only describe where ring-mode nodes sit. */}
            {!crowded && (
                <>
                    <path className="hub-orbit__ring" d={ringPath(INNER_RADIUS, 0, project)} />
                    <path className="hub-orbit__ring" d={ringPath(OUTER_RADIUS, Math.PI / 6, project)} />
                </>
            )}

            <g>
                {/* A spoke per node turns into a solid disc once crowded, so only
                    the focused node keeps its line to the hub. */}
                {placed
                    .filter(({ node }) => !crowded || node.id === focused)
                    .map(({ node, projected }) => (
                    <line
                        key={`spoke-${node.id}`}
                        x1={hub.sx}
                        y1={hub.sy}
                        x2={projected.sx}
                        y2={projected.sy}
                        className={`hub-orbit__spoke ${focused && focused !== node.id ? 'hub-orbit__spoke--dim' : ''}`}
                        strokeWidth={projected.scale}
                    />
                ))}
            </g>

            <g className="hub-orbit__hub">
                <circle cx={hub.sx} cy={hub.sy} r={HUB_RADIUS * hub.scale} />
                <text x={hub.sx} y={hub.sy + HUB_RADIUS * hub.scale + 18} textAnchor="middle">
                    {hubLabel}
                </text>
            </g>

            <g>
                {placed.map(({ node, projected }) => {
                    const isDim = focused !== null && focused !== node.id;
                    const r = radiusFor(node.weight) * projected.scale;
                    const toggle = () => onSelect(selectedId === node.id ? null : node.id);
                    return (
                        <g
                            key={node.id}
                            className={[
                                'hub-orbit__node',
                                node.tone === 'warning' ? 'hub-orbit__node--warning' : '',
                                node.outer ? 'hub-orbit__node--outer' : 'hub-orbit__node--inner',
                                isDim ? 'hub-orbit__node--dim' : '',
                                selectedId === node.id ? 'hub-orbit__node--selected' : '',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                            onClick={toggle}
                            onPointerEnter={(event) =>
                                onHover?.({ id: node.id, x: event.clientX, y: event.clientY })
                            }
                            onPointerMove={(event) => {
                                // While a drag is orbiting the scene, the tooltip must not
                                // chase the cursor across the canvas.
                                if (event.buttons !== 0) return;
                                onHover?.({ id: node.id, x: event.clientX, y: event.clientY });
                            }}
                            onPointerLeave={() => onHover?.(null)}
                            onFocus={(event) => onHover?.(anchorOfNode(event.currentTarget, node.id))}
                            onBlur={() => onHover?.(null)}
                            tabIndex={0}
                            role="button"
                            aria-label={node.label}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    toggle();
                                }
                            }}
                        >
                            <circle
                                cx={projected.sx}
                                cy={projected.sy}
                                r={r}
                                style={{ opacity: 0.5 + projected.scale * 0.5 }}
                            >
                                <title>{node.label}</title>
                            </circle>
                            {showLabel(node) && (
                                <text x={projected.sx} y={projected.sy - r - 7} textAnchor="middle">
                                    {node.label}
                                </text>
                            )}
                        </g>
                    );
                })}
            </g>
        </svg>
    );
}

export default HubOrbit;
export type { HubOrbitProps, HubNode };
