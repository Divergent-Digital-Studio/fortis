import { useState, useMemo, useEffect, useCallback } from 'react';
import { Workflow, RotateCcw, AlertCircle, RefreshCw, X } from 'lucide-react';
import { Badge, Button, EmptyState, ViewToggle, DataTable, OrbitTooltip, anchorOfNode, type Column } from '../common';
import useFlow from '../../hooks/useFlow';
import useViewMode from '../../hooks/useViewMode';
import useOrbitHover from '../../hooks/useOrbitHover';
import useOrbitCamera, { type Point3 } from '../../hooks/useOrbitCamera';
import { useI18n } from '../../i18n';
import type { FlowNode } from '@shared/types/m2';
import '../../styles/components/flow-view.css';

const VIEW_W = 1200;
const VIEW_H = 820;
const CENTER_X = VIEW_W / 2;
const CENTER_Y = VIEW_H / 2;

const PROCESS_RADIUS = 200;
const DESTINATION_RADIUS = 400;
const HELIX_HEIGHT = 300;
const CAMERA_DISTANCE = 1400;

/**
 * Nodes of each kind sit on their own coaxial helix, so a full orbit reveals
 * every one of them instead of hiding rows behind each other.
 */
function layoutOrbit(nodes: FlowNode[]): Map<string, Point3> {
    const positions = new Map<string, Point3>();

    for (const kind of ['process', 'destination'] as const) {
        const group = nodes.filter((n) => n.kind === kind);
        const radius = kind === 'process' ? PROCESS_RADIUS : DESTINATION_RADIUS;
        const turns = kind === 'process' ? 1 : 1.35;

        group.forEach((node, index) => {
            const t = group.length > 1 ? index / (group.length - 1) : 0.5;
            const angle = t * Math.PI * 2 * turns + (kind === 'process' ? 0 : Math.PI / 5);
            positions.set(node.id, {
                x: Math.cos(angle) * radius,
                y: (t - 0.5) * HELIX_HEIGHT,
                z: Math.sin(angle) * radius,
            });
        });
    }

    return positions;
}

interface FlowRow {
    id: string;
    from: string;
    to: string;
    weight: number;
}

/** The table lists the graph's edges: each row is one process→destination link. */
function toRows(nodes: FlowNode[], edges: { from: string; to: string; weight: number }[]): FlowRow[] {
    const labels = new Map(nodes.map((node) => [node.id, node.label]));
    return edges.map((edge) => ({
        id: `${edge.from}->${edge.to}`,
        from: labels.get(edge.from) ?? edge.from,
        to: labels.get(edge.to) ?? edge.to,
        weight: edge.weight,
    }));
}

/** Links previewed on hover before the tooltip grows unreadable. */
const HOVER_LINK_LIMIT = 5;

/** The rows of the table that involve this node, from its side of each edge. */
function linksOf(node: FlowNode, rows: FlowRow[]): FlowRow[] {
    const side = node.kind === 'process' ? 'from' : 'to';
    return rows.filter((row) => row[side] === node.label).sort((a, b) => b.weight - a.weight);
}

function FlowHoverCard({
    node,
    rows,
    anchorX,
    anchorY,
}: {
    node: FlowNode;
    rows: FlowRow[];
    anchorX: number;
    anchorY: number;
}) {
    const { t } = useI18n();
    const links = linksOf(node, rows);
    const shown = links.slice(0, HOVER_LINK_LIMIT);
    const hidden = links.length - shown.length;
    const peerLabel = node.kind === 'process' ? t('flow.legend.destinations') : t('flow.legend.processes');

    return (
        <OrbitTooltip anchorX={anchorX} anchorY={anchorY} contentKey={`${node.id}:${links.length}`}>
            <div className="orbit-tooltip__head">
                <span className="orbit-tooltip__name">{node.label}</span>
            </div>

            <dl className="orbit-tooltip__facts">
                <dt>{t('flow.tooltip.kind')}</dt>
                <dd>{node.kind === 'process' ? t('flow.tooltip.process') : t('flow.tooltip.destination')}</dd>
                <dt>{t('flow.tooltip.connections')}</dt>
                <dd>{node.weight}</dd>
                <dt>{peerLabel}</dt>
                <dd>{links.length}</dd>
            </dl>

            {shown.length > 0 && (
                <div className="orbit-tooltip__section">
                    <span className="orbit-tooltip__section-head">{peerLabel}</span>
                    {shown.map((row) => (
                        <span key={row.id} className="orbit-tooltip__row">
                            <span className="orbit-tooltip__row-name">
                                {node.kind === 'process' ? row.to : row.from}
                            </span>
                            <span className="orbit-tooltip__row-meta">{row.weight}</span>
                        </span>
                    ))}
                    {hidden > 0 && (
                        <span className="orbit-tooltip__more">{t('flow.more', { count: hidden })}</span>
                    )}
                </div>
            )}
        </OrbitTooltip>
    );
}

function FlowEdgePanel({
    row,
    rows,
    onClose,
}: {
    row: FlowRow;
    rows: FlowRow[];
    onClose: () => void;
}) {
    const { t } = useI18n();
    const siblingDestinations = rows
        .filter((other) => other.from === row.from && other.id !== row.id)
        .sort((a, b) => b.weight - a.weight);
    const siblingProcesses = rows
        .filter((other) => other.to === row.to && other.id !== row.id)
        .sort((a, b) => b.weight - a.weight);

    return (
        <aside className="page-panel scrollbar-overlay" aria-label={t('flow.panel.detailsAria')}>
            <header className="flow-view__panel-head">
                <Workflow size={18} strokeWidth={1.5} />
                <h3>{row.from}</h3>
                <button
                    type="button"
                    className="flow-view__panel-close"
                    onClick={onClose}
                    aria-label={t('flow.panel.closeAria')}
                >
                    <X size={16} strokeWidth={1.5} />
                </button>
            </header>

            <dl className="flow-view__facts">
                <dt>{t('flow.col.process')}</dt>
                <dd>{row.from}</dd>
                <dt>{t('flow.col.destination')}</dt>
                <dd className="flow-view__panel-mono">{row.to}</dd>
                <dt>{t('flow.col.connections')}</dt>
                <dd>{row.weight}</dd>
            </dl>

            {siblingDestinations.length > 0 && (
                <section className="flow-view__related">
                    <h4>{t('flow.legend.destinations')}</h4>
                    <ul>
                        {siblingDestinations.map((other) => (
                            <li key={other.id}>
                                <span className="flow-view__related-name flow-view__panel-mono">
                                    {other.to}
                                </span>
                                <Badge variant="neutral" size="sm" showIcon={false}>
                                    {other.weight}
                                </Badge>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {siblingProcesses.length > 0 && (
                <section className="flow-view__related">
                    <h4>{t('flow.legend.processes')}</h4>
                    <ul>
                        {siblingProcesses.map((other) => (
                            <li key={other.id}>
                                <span className="flow-view__related-name">{other.from}</span>
                                <Badge variant="neutral" size="sm" showIcon={false}>
                                    {other.weight}
                                </Badge>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </aside>
    );
}

function radiusFor(weight: number, maxWeight: number): number {
    if (maxWeight <= 0) return 7;
    return 7 + (weight / maxWeight) * 9;
}

function strokeWidthFor(weight: number, maxWeight: number): number {
    if (maxWeight <= 0) return 1;
    return 1 + (weight / maxWeight) * 3;
}

function FlowView() {
    const { t } = useI18n();
    const { graph, isLoading, error, refresh } = useFlow();
    const [mode, setMode] = useViewMode('flow');
    const [locked, setLocked] = useState<string | null>(null);
    const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
    const { anchor, hoveredId, onHover } = useOrbitHover();

    const hovered = mode === 'visual' ? hoveredId : null;
    const focused = mode === 'visual' ? (locked ?? hovered) : null;

    // A node dropped from the graph under the cursor must not keep its tooltip up.
    const hoveredNode = graph.nodes.find((node) => node.id === hovered) ?? null;

    const { project, handlers } = useOrbitCamera({
        centerX: CENTER_X,
        centerY: CENTER_Y,
        distance: CAMERA_DISTANCE,
        paused: focused !== null || mode === 'table',
    });

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setLocked(null);
                setSelectedRowId(null);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    // A lock made in one mode must not follow into the other: it would hold the
    // orbit paused and the panel open until the user clicks empty space.
    const handleModeChange = useCallback(
        (next: typeof mode) => {
            setLocked(null);
            setSelectedRowId(null);
            setMode(next);
        },
        [setMode],
    );

    const orbit = useMemo(() => layoutOrbit(graph.nodes), [graph.nodes]);

    const rows = useMemo(() => toRows(graph.nodes, graph.edges), [graph.nodes, graph.edges]);

    // A row dropped from the graph under the panel must not keep it open.
    const selectedRow = rows.find((row) => row.id === selectedRowId) ?? null;

    const columns = useMemo<ReadonlyArray<Column<FlowRow>>>(
        () => [
            { key: 'from', header: t('flow.col.process'), width: '1.4fr', sortValue: (row) => row.from },
            { key: 'to', header: t('flow.col.destination'), width: '1.8fr', mono: true, sortValue: (row) => row.to },
            { key: 'weight', header: t('flow.col.connections'), width: '0.7fr', sortValue: (row) => row.weight },
        ],
        [t],
    );

    const maxNodeWeight = useMemo(
        () => graph.nodes.reduce((max, n) => Math.max(max, n.weight), 0),
        [graph.nodes],
    );
    const maxEdgeWeight = useMemo(
        () => graph.edges.reduce((max, e) => Math.max(max, e.weight), 0),
        [graph.edges],
    );

    // Neighbours of the focused node, so hovering one endpoint keeps the whole
    // connection lit while everything unrelated recedes.
    const neighbours = useMemo(() => {
        if (!focused) return null;
        const ids = new Set<string>([focused]);
        for (const edge of graph.edges) {
            if (edge.from === focused) ids.add(edge.to);
            if (edge.to === focused) ids.add(edge.from);
        }
        return ids;
    }, [focused, graph.edges]);

    const projected = useMemo(() => {
        const map = new Map<string, ReturnType<typeof project>>();
        for (const node of graph.nodes) {
            const point = orbit.get(node.id);
            if (point) map.set(node.id, project(point));
        }
        return map;
    }, [graph.nodes, orbit, project]);

    // Painter's algorithm: far nodes first so near ones overlap them.
    const depthSorted = useMemo(
        () => [...graph.nodes].sort((a, b) => (projected.get(b.id)?.z ?? 0) - (projected.get(a.id)?.z ?? 0)),
        [graph.nodes, projected],
    );

    if (error && graph.nodes.length === 0) {
        return (
            <div className="page-view">
                <div className="flow-view__error">
                    <AlertCircle size={24} strokeWidth={1.5} className="flow-view__error-icon" />
                    <h3 className="flow-view__error-title">{t('flow.error.title')}</h3>
                    <p className="flow-view__error-message">{error}</p>
                    <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refresh()}>
                        {t('common.retry')}
                    </Button>
                </div>
            </div>
        );
    }

    if (graph.nodes.length === 0) {
        return (
            <div className="page-view">
                <EmptyState
                    icon={Workflow}
                    title={isLoading ? t('flow.empty.loadingTitle') : t('flow.empty.title')}
                    message={isLoading ? t('flow.empty.loadingMessage') : t('flow.empty.message')}
                />
            </div>
        );
    }

    return (
        <div className="page-view">
            <div className="page-toolbar">
                {mode === 'visual' && (
                    <div className="page-legend">
                        <span className="page-legend__item page-legend__item--process">{t('flow.legend.processes')}</span>
                        <span className="page-legend__item page-legend__item--destination">{t('flow.legend.destinations')}</span>
                    </div>
                )}
                {mode === 'visual' && (
                    <div className="page-toolbar__hint">
                        {locked ? t('flow.hint.locked') : t('flow.hint.orbit')}
                        {locked && (
                            <button type="button" className="page-toolbar__reset" onClick={() => setLocked(null)}>
                                <RotateCcw size={14} strokeWidth={1.5} />
                                {t('flow.release')}
                            </button>
                        )}
                    </div>
                )}
                <ViewToggle mode={mode} onChange={handleModeChange} />
            </div>

            {error && (
                <div className="flow-view__banner" role="alert">
                    <AlertCircle size={14} strokeWidth={1.5} />
                    <span className="flow-view__banner-message">{error}</span>
                    <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => refresh()}>
                        {t('common.retry')}
                    </Button>
                </div>
            )}

            {mode === 'table' ? (
                <div className="page-stage">
                    <div className="page-table">
                        <DataTable
                            rows={rows}
                            columns={columns}
                            rowKey={(row) => row.id}
                            label={t('flow.table.label')}
                            emptyMessage={t('flow.table.empty')}
                            onRowClick={(row) =>
                                setSelectedRowId((prev) => (prev === row.id ? null : row.id))
                            }
                            isRowActive={(row) => row.id === selectedRow?.id}
                        />
                    </div>

                    {selectedRow && (
                        <FlowEdgePanel
                            row={selectedRow}
                            rows={rows}
                            onClose={() => setSelectedRowId(null)}
                        />
                    )}
                </div>
            ) : (
            <div className="page-stage">
            <div className="page-canvas">
                <svg
                    viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                    className="flow-view__svg"
                    preserveAspectRatio="xMidYMid meet"
                    aria-label={t('flow.orbitAria')}
                    {...handlers}
                    onClick={(event) => {
                        if (event.target === event.currentTarget) setLocked(null);
                    }}
                >
                    <g>
                        {graph.edges.map((edge) => {
                            const from = projected.get(edge.from);
                            const to = projected.get(edge.to);
                            if (!from || !to) return null;
                            const isLit = !neighbours || edge.from === focused || edge.to === focused;
                            const depth = (from.scale + to.scale) / 2;
                            return (
                                <line
                                    key={`${edge.from}->${edge.to}`}
                                    x1={from.sx}
                                    y1={from.sy}
                                    x2={to.sx}
                                    y2={to.sy}
                                    className={`flow-view__edge ${isLit ? '' : 'flow-view__edge--dim'}`}
                                    strokeWidth={strokeWidthFor(edge.weight, maxEdgeWeight) * depth}
                                />
                            );
                        })}
                    </g>
                    <g>
                        {depthSorted.map((node) => {
                            const point = projected.get(node.id);
                            if (!point) return null;
                            const isLit = !neighbours || neighbours.has(node.id);
                            const isFocused = focused === node.id;
                            const r = radiusFor(node.weight, maxNodeWeight) * point.scale;
                            return (
                                <g
                                    key={node.id}
                                    className={[
                                        'flow-view__node',
                                        `flow-view__node--${node.kind}`,
                                        isLit ? '' : 'flow-view__node--dim',
                                        locked === node.id ? 'flow-view__node--locked' : '',
                                    ]
                                        .filter(Boolean)
                                        .join(' ')}
                                    onPointerEnter={(event) =>
                                        onHover({ id: node.id, x: event.clientX, y: event.clientY })
                                    }
                                    onPointerMove={(event) => {
                                        // A drag is orbiting the scene; the tooltip must not
                                        // chase the cursor across the canvas.
                                        if (event.buttons !== 0) return;
                                        onHover({ id: node.id, x: event.clientX, y: event.clientY });
                                    }}
                                    onPointerLeave={() => onHover(null)}
                                    onFocus={(event) => onHover(anchorOfNode(event.currentTarget, node.id))}
                                    onBlur={() => onHover(null)}
                                    onClick={() => setLocked((prev) => (prev === node.id ? null : node.id))}
                                    tabIndex={0}
                                    role="button"
                                    aria-label={`${node.label} (${node.kind})`}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            setLocked((prev) => (prev === node.id ? null : node.id));
                                        }
                                    }}
                                >
                                    <circle cx={point.sx} cy={point.sy} r={r} style={{ opacity: 0.45 + point.scale * 0.55 }} />
                                    <text
                                        x={point.sx}
                                        y={point.sy - r - 7}
                                        textAnchor="middle"
                                        className={`flow-view__label ${isFocused ? 'flow-view__label--focused' : ''}`}
                                    >
                                        {node.label}
                                    </text>
                                </g>
                            );
                        })}
                    </g>
                </svg>

                {hoveredNode && anchor && (
                    <FlowHoverCard
                        node={hoveredNode}
                        rows={rows}
                        anchorX={anchor.x}
                        anchorY={anchor.y}
                    />
                )}
            </div>
            </div>
            )}
        </div>
    );
}

export default FlowView;
