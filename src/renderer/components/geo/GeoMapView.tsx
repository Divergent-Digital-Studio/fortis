import { useMemo, useState, useCallback, useEffect } from 'react';
import {
    Map as MapIcon,
    Plus,
    Minus,
    Maximize2,
    Globe,
    X,
    AlertCircle,
    RefreshCw,
} from 'lucide-react';
import {
    Badge,
    Button,
    EmptyState,
    ViewToggle,
    DataTable,
    OrbitTooltip,
    anchorOfNode,
    type Column,
} from '../common';
import { useI18n } from '../../i18n';
import useGeoConnections from '../../hooks/useGeoConnections';
import useViewMode from '../../hooks/useViewMode';
import useMapTransform from '../../hooks/useMapTransform';
import useOrbitHover from '../../hooks/useOrbitHover';
import { LAND_PATH, BORDER_PATH } from './world-land';
import type { GeoConnection } from '@shared/types/m1';
import '../../styles/components/geo-map-view.css';

/* Must match scripts/build-world-land.mjs: equirectangular, clipped to +/-60 deg. */
const MAP_WIDTH = 360;
const LAT_LIMIT = 60;
const MAP_HEIGHT = 2 * LAT_LIMIT;
const MERIDIANS = [60, 120, 180, 240, 300];
const PARALLELS = [30, 60, 90];
const MIN_RADIUS = 1.6;
const MAX_RADIUS = 5;
const ZOOM_STEP = 1.6;

interface PlottedPoint {
    key: string;
    cx: number;
    cy: number;
    count: number;
    city: string | null;
    countryName: string | null;
    countryCode: string | null;
    latitude: number;
    longitude: number;
    members: GeoConnection[];
}

interface CountryGroup {
    code: string;
    name: string;
    count: number;
}

function projectToViewBox(lon: number, lat: number): { cx: number; cy: number } {
    return {
        cx: ((lon + 180) / 360) * MAP_WIDTH,
        cy: ((LAT_LIMIT - lat) / (2 * LAT_LIMIT)) * MAP_HEIGHT,
    };
}

function scaleRadius(count: number): number {
    const radius = MIN_RADIUS + Math.log2(count + 1) * 0.7;
    return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, radius));
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/*
 * One marker per resolved location, not per address: many addresses share a city
 * (a CDN edge), and they would otherwise stack invisibly on the same pixel.
 * Melbourne and Sydney are distinct points even though both are AU.
 */
function buildPoints(connections: GeoConnection[]): PlottedPoint[] {
    const groups = new Map<string, PlottedPoint>();

    for (const connection of connections) {
        if (connection.latitude === null || connection.longitude === null) continue;
        const key = `${connection.latitude},${connection.longitude}`;
        const existing = groups.get(key);
        if (existing) {
            existing.count += connection.connectionCount;
            existing.members.push(connection);
            continue;
        }
        const { cx, cy } = projectToViewBox(connection.longitude, connection.latitude);
        groups.set(key, {
            key,
            cx,
            cy,
            count: connection.connectionCount,
            city: connection.city,
            countryName: connection.countryName,
            countryCode: connection.countryCode,
            latitude: connection.latitude,
            longitude: connection.longitude,
            members: [connection],
        });
    }

    /* Smallest first, so a busy hub paints over its quieter neighbours. */
    return Array.from(groups.values()).sort((a, b) => a.count - b.count);
}

function placeLabel(point: PlottedPoint, unknownLabel: string): string {
    const country = point.countryName ?? point.countryCode ?? unknownLabel;
    return point.city !== null && point.city !== '' ? `${point.city}, ${country}` : country;
}

const HOVER_MEMBER_LIMIT = 6;

function GeoTooltip({
    point,
    anchorX,
    anchorY,
}: {
    point: PlottedPoint;
    anchorX: number;
    anchorY: number;
}) {
    const { t } = useI18n();
    const members = [...point.members].sort((a, b) => b.connectionCount - a.connectionCount);
    const shown = members.slice(0, HOVER_MEMBER_LIMIT);
    const hidden = members.length - shown.length;

    return (
        <OrbitTooltip
            anchorX={anchorX}
            anchorY={anchorY}
            contentKey={`${point.key}:${members.length}`}
        >
            <div className="orbit-tooltip__head">
                <span className="orbit-tooltip__name">{placeLabel(point, t('geo.unknown'))}</span>
                {point.countryCode !== null && (
                    <Badge variant="neutral" size="sm" showIcon={false}>
                        {point.countryCode}
                    </Badge>
                )}
            </div>

            <dl className="orbit-tooltip__facts">
                <dt>{t('geo.tooltip.addresses')}</dt>
                <dd>{members.length}</dd>
                <dt>{t('geo.tooltip.connections')}</dt>
                <dd>{point.count}</dd>
                <dt>{t('geo.tooltip.coordinates')}</dt>
                <dd className="orbit-tooltip__mono">
                    {point.latitude.toFixed(2)}, {point.longitude.toFixed(2)}
                </dd>
            </dl>

            <div className="orbit-tooltip__section">
                <span className="orbit-tooltip__section-head">
                    {t('geo.tooltip.remoteAddresses')}
                </span>
                {shown.map((member) => (
                    <span key={member.remoteAddress} className="orbit-tooltip__row">
                        <span className="orbit-tooltip__row-name orbit-tooltip__mono">
                            {member.remoteAddress}
                        </span>
                        <span className="orbit-tooltip__row-meta">{member.connectionCount}</span>
                    </span>
                ))}
                {hidden > 0 && (
                    <span className="orbit-tooltip__more">
                        {t('geo.tooltip.more', { count: hidden })}
                    </span>
                )}
            </div>
        </OrbitTooltip>
    );
}

function buildCountryGroups(connections: GeoConnection[], unknownLabel: string): CountryGroup[] {
    const groups = new Map<string, CountryGroup>();
    for (const connection of connections) {
        const code = connection.countryCode ?? 'ZZ';
        const existing = groups.get(code);
        if (existing) {
            existing.count += connection.connectionCount;
            continue;
        }
        groups.set(code, {
            code,
            name: connection.countryName ?? unknownLabel,
            count: connection.connectionCount,
        });
    }
    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}

function GeoDetailPanel({
    connection,
    onClose,
}: {
    connection: GeoConnection;
    onClose: () => void;
}) {
    const { t } = useI18n();

    return (
        <aside className="page-panel scrollbar-overlay" aria-label={t('geo.panel.detailsAria')}>
            <header className="geo-map-view__panel-head">
                <Globe size={18} strokeWidth={1.5} />
                <h3>{connection.remoteAddress}</h3>
                <button
                    type="button"
                    className="geo-map-view__panel-close"
                    onClick={onClose}
                    aria-label={t('geo.panel.closeAria')}
                >
                    <X size={16} strokeWidth={1.5} />
                </button>
            </header>

            <dl className="geo-map-view__facts">
                <dt>{t('geo.col.city')}</dt>
                <dd>{connection.city !== null && connection.city !== '' ? connection.city : '—'}</dd>
                <dt>{t('geo.col.country')}</dt>
                <dd>{connection.countryName ?? t('geo.unknown')}</dd>
                <dt>{t('geo.col.code')}</dt>
                <dd>{connection.countryCode ?? '—'}</dd>
                <dt>{t('geo.col.coordinates')}</dt>
                <dd className="geo-map-view__mono">
                    {connection.latitude === null || connection.longitude === null
                        ? '—'
                        : `${connection.latitude.toFixed(2)}, ${connection.longitude.toFixed(2)}`}
                </dd>
                <dt>{t('geo.col.connections')}</dt>
                <dd>{connection.connectionCount}</dd>
            </dl>
        </aside>
    );
}

function geoColumns(t: Translate): ReadonlyArray<Column<GeoConnection>> {
    return [
        {
            key: 'remoteAddress',
            /* Floored to the header, not to a 39-char IPv6 literal: a min-content
               floor here would outgrow the table. Long values truncate instead. */
            header: t('geo.col.remoteAddress'),
            width: 'minmax(8rem, 2.2fr)',
            mono: true,
            sortValue: (row) => row.remoteAddress,
        },
        {
            key: 'city',
            header: t('geo.col.city'),
            width: '1.1fr',
            sortValue: (row) => row.city ?? '',
            render: (row) => (row.city !== null && row.city !== '' ? row.city : '—'),
        },
        {
            key: 'countryName',
            header: t('geo.col.country'),
            width: '1.2fr',
            sortValue: (row) => row.countryName ?? '',
            render: (row) => row.countryName ?? t('geo.unknown'),
        },
        /* min-content floors: the uppercase, letter-spaced headers are wider than
           their values, and a translated header must never clip. */
        {
            key: 'countryCode',
            header: t('geo.col.code'),
            width: 'minmax(min-content, 0.6fr)',
            sortValue: (row) => row.countryCode ?? '',
            render: (row) => row.countryCode ?? '—',
        },
        {
            key: 'coordinates',
            header: t('geo.col.coordinates'),
            width: 'minmax(min-content, 1.3fr)',
            mono: true,
            sortValue: (row) => row.latitude ?? -Infinity,
            render: (row) =>
                row.latitude === null || row.longitude === null
                    ? '—'
                    : `${row.latitude.toFixed(2)}, ${row.longitude.toFixed(2)}`,
        },
        {
            key: 'connectionCount',
            header: t('geo.col.connections'),
            width: 'minmax(min-content, 0.9fr)',
            sortValue: (row) => row.connectionCount,
        },
    ];
}

function GeoMapView() {
    const { t, tn } = useI18n();
    const { connections, isLoading, error, refresh } = useGeoConnections();
    const [mode, setMode] = useViewMode('geo');
    const { transform, isPanning, reset, zoomBy, containerRef, onPointerDown } = useMapTransform(
        MAP_WIDTH,
        MAP_HEIGHT,
    );
    const { anchor, hoveredId, onHover } = useOrbitHover();
    const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

    const points = useMemo(() => buildPoints(connections), [connections]);
    const countryGroups = useMemo(
        () => buildCountryGroups(connections, t('geo.unknown')),
        [connections, t],
    );
    const columns = useMemo(() => geoColumns(t), [t]);
    const hoveredPoint = points.find((point) => point.key === hoveredId) ?? null;

    // A connection dropped from the list under the panel must not keep it open.
    const selected = connections.find((c) => c.remoteAddress === selectedAddress) ?? null;

    // A selection made in one mode must not follow into the other.
    const handleModeChange = useCallback(
        (next: typeof mode) => {
            setSelectedAddress(null);
            setMode(next);
        },
        [setMode],
    );

    useEffect(() => {
        if (mode !== 'table') return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSelectedAddress(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [mode]);

    if (error && connections.length === 0) {
        return (
            <div className="page-view">
                <div className="geo-map-view__error">
                    <AlertCircle size={24} strokeWidth={1.5} />
                    <h3>{t('geo.error.title')}</h3>
                    <p>{error}</p>
                    <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refresh()}>
                        {t('common.retry')}
                    </Button>
                </div>
            </div>
        );
    }

    if (connections.length === 0) {
        return (
            <div className="page-view">
                <EmptyState
                    icon={MapIcon}
                    title={isLoading ? t('geo.empty.loadingTitle') : t('geo.empty.title')}
                    message={isLoading ? t('geo.empty.loadingMessage') : t('geo.empty.message')}
                />
            </div>
        );
    }

    /* Counter-scale so markers and strokes keep a constant on-screen size while zoomed. */
    const inverse = 1 / transform.zoom;

    return (
        <div className="page-view">
            <div className="page-toolbar">
                <span className="page-toolbar__count">
                    {tn('geo.count', connections.length)}
                </span>
                <ViewToggle mode={mode} onChange={handleModeChange} />
            </div>

            {error && (
                <div className="geo-map-view__banner" role="alert">
                    <AlertCircle size={14} strokeWidth={1.5} />
                    <span className="geo-map-view__banner-message">{error}</span>
                    <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => refresh()}>
                        {t('common.retry')}
                    </Button>
                </div>
            )}

            {mode === 'table' ? (
                <div className="page-stage">
                    <div className="page-table">
                        <DataTable
                            rows={connections}
                            columns={columns}
                            rowKey={(row) => row.remoteAddress}
                            label={t('geo.tableAria')}
                            onRowClick={(row) =>
                                setSelectedAddress((prev) =>
                                    prev === row.remoteAddress ? null : row.remoteAddress,
                                )
                            }
                            isRowActive={(row) => row.remoteAddress === selected?.remoteAddress}
                        />
                    </div>

                    {selected && (
                        <GeoDetailPanel
                            connection={selected}
                            onClose={() => setSelectedAddress(null)}
                        />
                    )}
                </div>
            ) : points.length === 0 ? (
                /* Connections without coordinates are invisible on the map but do exist,
                   so the toolbar above keeps the switch to the table reachable. */
                <EmptyState
                    icon={MapIcon}
                    title={t('geo.empty.noCoordsTitle')}
                    message={t('geo.empty.noCoordsMessage')}
                />
            ) : (
                <div className="page-stage">
                    <div
                        ref={containerRef}
                        className={`page-canvas geo-map-view__canvas${isPanning ? ' geo-map-view__canvas--panning' : ''}`}
                        onPointerDown={onPointerDown}
                    >
                        <svg
                            className="geo-map-view__svg"
                            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                            /* Not role="img": that would hide the focusable markers below. */
                            role="group"
                            aria-label={t('geo.mapAria')}
                            preserveAspectRatio="xMidYMid meet"
                        >
                            <rect
                                className="geo-map-view__ocean"
                                x={0}
                                y={0}
                                width={MAP_WIDTH}
                                height={MAP_HEIGHT}
                            />
                            <g
                                transform={`translate(${transform.x} ${transform.y}) scale(${transform.zoom})`}
                            >
                                {MERIDIANS.map((x) => (
                                    <line
                                        key={`meridian-${x}`}
                                        className="geo-map-view__graticule"
                                        x1={x}
                                        y1={0}
                                        x2={x}
                                        y2={MAP_HEIGHT}
                                        strokeWidth={0.4 * inverse}
                                    />
                                ))}
                                {PARALLELS.map((y) => (
                                    <line
                                        key={`parallel-${y}`}
                                        className="geo-map-view__graticule"
                                        x1={0}
                                        y1={y}
                                        x2={MAP_WIDTH}
                                        y2={y}
                                        strokeWidth={0.4 * inverse}
                                    />
                                ))}
                                <path
                                    className="geo-map-view__land"
                                    d={LAND_PATH}
                                    strokeWidth={0.25 * inverse}
                                />
                                <path
                                    className="geo-map-view__border"
                                    d={BORDER_PATH}
                                    strokeWidth={0.18 * inverse}
                                />
                                {points.map((point) => (
                                    <circle
                                        key={point.key}
                                        className={`geo-map-view__point${
                                            hoveredId === point.key
                                                ? ' geo-map-view__point--hovered'
                                                : ''
                                        }`}
                                        cx={point.cx}
                                        cy={point.cy}
                                        r={scaleRadius(point.count) * inverse}
                                        strokeWidth={0.4 * inverse}
                                        tabIndex={0}
                                        role="button"
                                        aria-label={`${placeLabel(point, t('geo.unknown'))}, ${tn('geo.count', point.count)}`}
                                        /* A drag is a pan, not a hover: sweeping the cursor
                                           across markers mid-pan must not open the popup. */
                                        onPointerEnter={(event) => {
                                            if (event.buttons !== 0) return;
                                            onHover({
                                                id: point.key,
                                                x: event.clientX,
                                                y: event.clientY,
                                            });
                                        }}
                                        onPointerMove={(event) => {
                                            if (event.buttons !== 0) return;
                                            onHover({
                                                id: point.key,
                                                x: event.clientX,
                                                y: event.clientY,
                                            });
                                        }}
                                        onPointerLeave={() => onHover(null)}
                                        onFocus={(event) =>
                                            onHover(anchorOfNode(event.currentTarget, point.key))
                                        }
                                        onBlur={() => onHover(null)}
                                    />
                                ))}
                            </g>
                        </svg>

                        {anchor !== null && hoveredPoint !== null && (
                            <GeoTooltip
                                point={hoveredPoint}
                                anchorX={anchor.x}
                                anchorY={anchor.y}
                            />
                        )}

                        <div className="geo-map-view__controls">
                            <button
                                type="button"
                                className="geo-map-view__control"
                                onClick={() => zoomBy(ZOOM_STEP)}
                                aria-label={t('geo.zoomIn')}
                            >
                                <Plus size={16} strokeWidth={1.5} />
                            </button>
                            <button
                                type="button"
                                className="geo-map-view__control"
                                onClick={() => zoomBy(1 / ZOOM_STEP)}
                                aria-label={t('geo.zoomOut')}
                            >
                                <Minus size={16} strokeWidth={1.5} />
                            </button>
                            <button
                                type="button"
                                className="geo-map-view__control"
                                onClick={reset}
                                aria-label={t('geo.resetView')}
                            >
                                <Maximize2 size={16} strokeWidth={1.5} />
                            </button>
                        </div>
                    </div>

                    <aside className="page-panel scrollbar-overlay" aria-label={t('geo.countries')}>
                        <h3 className="geo-map-view__panel-title">{t('geo.countries')}</h3>
                        <ul className="geo-map-view__list">
                            {countryGroups.map((group) => (
                                <li className="geo-map-view__list-item" key={group.code}>
                                    <span className="geo-map-view__list-name">{group.name}</span>
                                    <Badge variant="neutral" size="sm" showIcon={false}>
                                        {group.count}
                                    </Badge>
                                </li>
                            ))}
                        </ul>
                    </aside>
                </div>
            )}
        </div>
    );
}

export default GeoMapView;
