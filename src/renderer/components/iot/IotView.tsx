import { useState, useMemo, useCallback, useEffect } from 'react';
import { Cctv, AlertTriangle, AlertCircle, RefreshCw, X } from 'lucide-react';
import {
    Button,
    Card,
    Badge,
    SearchInput,
    EmptyState,
    ViewToggle,
    DataTable,
    HubOrbit,
    OrbitTooltip,
    type Column,
    type HubNode,
} from '../common';
import useIotDevices from '../../hooks/useIotDevices';
import { useI18n } from '../../i18n';
import useViewMode from '../../hooks/useViewMode';
import useOrbitHover from '../../hooks/useOrbitHover';
import type { IotDevice } from '@shared/types/m1';
import '../../styles/components/iot-view.css';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function formatTimestamp(value: number): string {
    return new Date(value).toLocaleString();
}

function iotColumns(t: Translate): ReadonlyArray<Column<IotDevice>> {
    return [
        // Every floor below is the widest *header* across en/es/fr/de, rounded up.
        // Never floor to min-content here: the values (IEEE vendor names, locale
        // timestamps) are far wider than their headers and would overflow the grid
        // once the details panel narrows the table. Values ellipsize instead.
        {
            key: 'name',
            header: t('iot.col.device'),
            width: 'minmax(5rem, 1.6fr)',
            sortValue: (device) => device.name,
            render: (device) => (
                <span className="iot-view__cell-name">
                    <Cctv size={16} strokeWidth={1.5} />
                    <span className="iot-view__truncate">{device.name}</span>
                </span>
            ),
        },
        {
            key: 'category',
            header: t('iot.col.category'),
            width: 'minmax(4.5rem, 0.9fr)',
            sortValue: (device) => device.category,
            render: (device) => <span className="iot-view__truncate">{device.category}</span>,
        },
        {
            key: 'ip',
            header: t('iot.col.ip'),
            width: 'minmax(5.5rem, 1fr)',
            mono: true,
            sortValue: (device) => device.ip,
        },
        {
            key: 'vendor',
            header: t('iot.col.vendor'),
            width: 'minmax(5rem, 1.2fr)',
            sortValue: (device) => device.vendor ?? '',
            render: (device) => (
                <span className="iot-view__truncate" title={device.vendor ?? undefined}>
                    {device.vendor ?? '—'}
                </span>
            ),
        },
        {
            key: 'lastSeen',
            header: t('iot.col.lastSeen'),
            width: 'minmax(9rem, 1.3fr)',
            sortValue: (device) => device.lastSeen,
            render: (device) => (
                <span className="iot-view__truncate">{formatTimestamp(device.lastSeen)}</span>
            ),
        },
    ];
}

/** Devices reaching foreign destinations sit on the outer ring; anomalies glow. */
function toOrbitNodes(devices: IotDevice[]): HubNode[] {
    return devices.map((device) => ({
        id: device.mac,
        label: device.name,
        weight: device.destinations.length,
        outer: device.destinations.length > 0,
        tone: device.hasAnomaly ? ('warning' as const) : ('default' as const),
    }));
}

function matchesSearch(device: IotDevice, lower: string): boolean {
    if (lower.length === 0) return true;
    const haystack =
        `${device.name} ${device.vendor ?? ''} ${device.category} ${device.ip} ${device.mac}`.toLowerCase();
    return haystack.includes(lower);
}

/**
 * Destinations and the anomaly flag are network-wide: sockets carry no LAN-device
 * owner, so they are identical on every device. The panel says so rather than
 * implying this camera is the one talking to a new country.
 */
function NetworkDestinations({ destinations }: { destinations: string[] }) {
    const { t } = useI18n();

    return (
        <div className="iot-view__field">
            <span className="iot-view__label">{t('iot.networkDestinations')}</span>
            {destinations.length > 0 ? (
                <span className="iot-view__destinations">
                    {destinations.map((destination) => (
                        <Badge key={destination} variant="info" size="sm" showIcon={false}>
                            {destination}
                        </Badge>
                    ))}
                </span>
            ) : (
                <span className="iot-view__muted">{t('iot.noDestinations')}</span>
            )}
            <span className="iot-view__scope-note">{t('iot.networkScopeNote')}</span>
        </div>
    );
}

function IotDeviceCard({ device, onClose }: { device: IotDevice; onClose: () => void }) {
    const { t } = useI18n();

    return (
        <Card className="iot-view__card">
            <div className="iot-view__header">
                <span className="iot-view__vendor">
                    <Cctv size={18} strokeWidth={1.5} />
                    <span>{device.name}</span>
                </span>
                <Badge variant="neutral" size="sm" showIcon={false}>
                    {device.category}
                </Badge>
                <button
                    type="button"
                    className="iot-view__panel-close"
                    onClick={onClose}
                    aria-label={t('iot.panel.closeAria')}
                >
                    <X size={16} strokeWidth={1.5} />
                </button>
            </div>

            <dl className="iot-view__facts">
                <dt>{t('iot.col.ip')}</dt>
                <dd className="iot-view__mono">{device.ip}</dd>
                <dt>{t('iot.col.mac')}</dt>
                <dd className="iot-view__mono">{device.mac}</dd>
                <dt>{t('iot.col.vendor')}</dt>
                <dd>{device.vendor ?? '—'}</dd>
                <dt>{t('iot.firstSeen')}</dt>
                <dd>{formatTimestamp(device.firstSeen)}</dd>
                <dt>{t('iot.col.lastSeen')}</dt>
                <dd>{formatTimestamp(device.lastSeen)}</dd>
            </dl>

            <NetworkDestinations destinations={device.destinations} />
        </Card>
    );
}

const HOVER_DESTINATION_LIMIT = 4;

function IotHoverCard({
    device,
    anchorX,
    anchorY,
}: {
    device: IotDevice;
    anchorX: number;
    anchorY: number;
}) {
    const { t, tn } = useI18n();
    const shown = device.destinations.slice(0, HOVER_DESTINATION_LIMIT);
    const hidden = device.destinations.length - shown.length;

    return (
        <OrbitTooltip anchorX={anchorX} anchorY={anchorY} contentKey={device.mac}>
            <div className="orbit-tooltip__head">
                <span className="orbit-tooltip__name">{device.name}</span>
                <Badge variant="neutral" size="sm" showIcon={false}>
                    {device.category}
                </Badge>
            </div>

            <dl className="orbit-tooltip__facts">
                <dt>{t('iot.col.category')}</dt>
                <dd>{device.category}</dd>
                <dt>{t('iot.col.ip')}</dt>
                <dd className="orbit-tooltip__mono">{device.ip}</dd>
                <dt>{t('iot.col.vendor')}</dt>
                <dd>{device.vendor ?? '—'}</dd>
                <dt>{t('iot.col.mac')}</dt>
                <dd className="orbit-tooltip__mono">{device.mac}</dd>
                <dt>{t('iot.col.lastSeen')}</dt>
                <dd>{formatTimestamp(device.lastSeen)}</dd>
            </dl>

            <div className="orbit-tooltip__section">
                <span className="orbit-tooltip__section-head">
                    {device.destinations.length === 0
                        ? t('iot.destinations.none')
                        : tn('iot.destinations', device.destinations.length)}
                </span>
                {shown.map((destination) => (
                    <span key={destination} className="orbit-tooltip__row">
                        <span className="orbit-tooltip__row-name">{destination}</span>
                    </span>
                ))}
                {hidden > 0 && (
                    <span className="orbit-tooltip__more">{t('iot.tooltip.more', { count: hidden })}</span>
                )}
            </div>
        </OrbitTooltip>
    );
}

function IotView() {
    const { t, tn } = useI18n();
    const { devices, isLoading, error, refresh } = useIotDevices();
    const [mode, setMode] = useViewMode('iot');
    const [search, setSearch] = useState('');
    const [selectedMac, setSelectedMac] = useState<string | null>(null);
    const { anchor, hoveredId, onHover } = useOrbitHover();

    const filtered = useMemo(() => {
        const lower = search.trim().toLowerCase();
        return devices.filter((device) => matchesSearch(device, lower));
    }, [devices, search]);

    const orbitNodes = useMemo(() => toOrbitNodes(filtered), [filtered]);
    const columns = useMemo(() => iotColumns(t), [t]);

    // A device filtered out from under the selection must not keep the panel open.
    const selected = filtered.find((device) => device.mac === selectedMac) ?? null;
    const hovered = filtered.find((device) => device.mac === hoveredId) ?? null;

    // Destinations and the anomaly are network-wide, so any device carries them.
    const [first] = devices;
    const anomalyReason = first?.hasAnomaly === true ? first.anomalyReason : null;

    // A selection made in one mode must not follow into the other: it would keep
    // the panel open and hold the orbit paused until the user clicks empty space.
    const handleModeChange = useCallback(
        (next: typeof mode) => {
            setSelectedMac(null);
            setMode(next);
        },
        [setMode],
    );

    // HubOrbit owns the canvas while it is mounted; in table mode nothing else would.
    useEffect(() => {
        if (mode !== 'table') return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSelectedMac(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [mode]);

    if (error && devices.length === 0) {
        return (
            <div className="page-view">
                <div className="iot-view__error">
                    <AlertCircle size={24} strokeWidth={1.5} />
                    <h3>{t('iot.error.title')}</h3>
                    <p>{error}</p>
                    <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refresh()}>
                        {t('common.retry')}
                    </Button>
                </div>
            </div>
        );
    }

    if (devices.length === 0) {
        return (
            <div className="page-view">
                <EmptyState
                    icon={Cctv}
                    title={isLoading ? t('iot.empty.loadingTitle') : t('iot.empty.title')}
                    message={isLoading ? t('iot.empty.loadingMessage') : t('iot.empty.message')}
                />
            </div>
        );
    }

    return (
        <div className="page-view">
            <div className="page-toolbar">
                <SearchInput
                    className="page-toolbar__grow"
                    value={search}
                    onChange={setSearch}
                    placeholder={t('iot.searchPlaceholder')}
                />
                {mode === 'visual' && (
                    <div className="page-legend">
                        <span className="page-legend__item page-legend__item--lan">
                            {t('iot.legend.lan')}
                        </span>
                        <span className="page-legend__item page-legend__item--outer">
                            {t('iot.legend.outer')}
                        </span>
                        <span className="page-legend__item page-legend__item--iot">
                            {t('iot.legend.anomaly')}
                        </span>
                    </div>
                )}
                <span className="page-toolbar__count">
                    {search.trim().length > 0
                        ? t('iot.countFiltered', { filtered: filtered.length, total: devices.length })
                        : tn('iot.count', devices.length)}
                </span>
                {mode === 'visual' && (
                    <span className="page-toolbar__hint">
                        {selected ? t('iot.hint.selected') : t('iot.hint.orbit')}
                    </span>
                )}
                <ViewToggle mode={mode} onChange={handleModeChange} />
            </div>

            {error && devices.length > 0 && (
                <div className="iot-view__banner" role="alert">
                    <AlertCircle size={14} strokeWidth={1.5} />
                    <span className="iot-view__banner-message">{error}</span>
                    <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => refresh()}>
                        {t('common.retry')}
                    </Button>
                </div>
            )}

            {anomalyReason !== null && (
                <div className="iot-view__anomaly" role="status">
                    <AlertTriangle size={16} strokeWidth={1.5} />
                    <span>{t('iot.banner.anomaly', { reason: anomalyReason })}</span>
                </div>
            )}

            {filtered.length === 0 ? (
                <EmptyState
                    icon={Cctv}
                    title={t('iot.empty.filteredTitle')}
                    message={t('iot.empty.filteredMessage')}
                />
            ) : (
                <div className="page-stage">
                    {mode === 'table' ? (
                        <div className="page-table">
                            <DataTable
                                rows={filtered}
                                columns={columns}
                                rowKey={(device) => device.mac}
                                label={t('iot.tableAria')}
                                onRowClick={(device) =>
                                    setSelectedMac((prev) => (prev === device.mac ? null : device.mac))
                                }
                                isRowActive={(device) => device.mac === selected?.mac}
                            />
                        </div>
                    ) : (
                        <div className="page-canvas">
                            <HubOrbit
                                nodes={orbitNodes}
                                hubLabel={t('iot.hubLabel')}
                                selectedId={selected?.mac ?? null}
                                onSelect={setSelectedMac}
                                ariaLabel={t('iot.orbitAria')}
                                onHover={onHover}
                                hoveredId={hovered?.mac ?? null}
                            />
                        </div>
                    )}

                    {mode === 'visual' && hovered && anchor && (
                        <IotHoverCard device={hovered} anchorX={anchor.x} anchorY={anchor.y} />
                    )}

                    {selected && (
                        <aside className="page-panel scrollbar-overlay" aria-label={t('iot.panel.detailsAria')}>
                            <IotDeviceCard device={selected} onClose={() => setSelectedMac(null)} />
                        </aside>
                    )}
                </div>
            )}
        </div>
    );
}

export default IotView;
