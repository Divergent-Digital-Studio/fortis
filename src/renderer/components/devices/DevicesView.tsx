import { useState, useMemo, useCallback, useEffect } from 'react';
import { Wifi, Router, AlertCircle, RefreshCw, Pencil, X } from 'lucide-react';
import {
    Button,
    Badge,
    SearchInput,
    Select,
    EmptyState,
    ViewToggle,
    DataTable,
    type Column,
} from '../common';
import useDevices from '../../hooks/useDevices';
import { useI18n } from '../../i18n';
import useViewMode from '../../hooks/useViewMode';
import useOrbitHover from '../../hooks/useOrbitHover';
import useConnections from '../../hooks/useConnections';
import RenameDeviceDialog from './RenameDeviceDialog';
import DeviceOrbit from './DeviceOrbit';
import DeviceTooltip from './DeviceTooltip';
import type { WifiDevice } from '@shared/types/m1';
import type { NetworkConnection } from '../../types';
import { deviceLabel, prettifyHostname } from '@shared/utils/device-label';
import '../../styles/components/devices-view.css';

type DeviceFilter = 'all' | 'iot' | 'new';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const NEW_DEVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function isNewDevice(device: WifiDevice, now: number): boolean {
    return device.firstSeen > now - NEW_DEVICE_WINDOW_MS;
}

function formatTimestamp(value: number): string {
    return new Date(value).toLocaleString();
}

const displayName = deviceLabel;

/** Identifier used as the rename dialog's hint (the next-best name). */
function fallbackHint(device: WifiDevice): string {
    return prettifyHostname(device.hostname) ?? device.vendor ?? `${device.ip} (${device.mac})`;
}

/**
 * Connections are captured on this machine, so a device's traffic is the set of
 * sockets whose remote end is that device's IP — never `localAddress`, which is
 * always this host.
 */
function connectionsByRemoteIp(connections: NetworkConnection[]): Map<string, NetworkConnection[]> {
    const byIp = new Map<string, NetworkConnection[]>();
    for (const connection of connections) {
        const existing = byIp.get(connection.remoteAddress);
        if (existing) existing.push(connection);
        else byIp.set(connection.remoteAddress, [connection]);
    }
    return byIp;
}

function deviceColumns(
    isNew: (device: WifiDevice) => boolean,
    t: Translate,
): ReadonlyArray<Column<WifiDevice>> {
    return [
        {
            key: 'name',
            header: t('devices.col.device'),
            width: '1.6fr',
            sortValue: (device) => displayName(device),
            render: (device) => (
                <span className="devices-view__cell-name">
                    {device.isIot ? (
                        <Router size={16} strokeWidth={1.5} />
                    ) : (
                        <Wifi size={16} strokeWidth={1.5} />
                    )}
                    <span>{displayName(device)}</span>
                    {isNew(device) && (
                        <Badge variant="info" size="sm" showIcon={false}>
                            {t('devices.badge.new')}
                        </Badge>
                    )}
                </span>
            ),
        },
        {
            key: 'type',
            header: t('devices.col.type'),
            width: '0.9fr',
            sortValue: (device) =>
                device.isIot
                    ? device.iotCategory ?? t('devices.type.iot')
                    : t('devices.type.device'),
        },
        {
            key: 'vendor',
            header: t('devices.col.vendor'),
            width: '1.2fr',
            sortValue: (device) => device.vendor ?? '—',
        },
        {
            key: 'ip',
            header: t('devices.col.ip'),
            width: '1fr',
            mono: true,
            sortValue: (device) => device.ip,
        },
        {
            key: 'mac',
            header: t('devices.col.mac'),
            width: '1.2fr',
            mono: true,
            sortValue: (device) => device.mac,
        },
        {
            key: 'lastSeen',
            header: t('devices.col.lastSeen'),
            width: '1.3fr',
            sortValue: (device) => device.lastSeen,
            render: (device) => formatTimestamp(device.lastSeen),
        },
    ];
}

function DevicesView() {
    const { t } = useI18n();
    const { devices, isLoading, error, refresh } = useDevices();
    const { connections } = useConnections();
    const [mode, setMode] = useViewMode('devices');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<DeviceFilter>('all');
    const [renameTarget, setRenameTarget] = useState<WifiDevice | null>(null);
    const [selectedMac, setSelectedMac] = useState<string | null>(null);
    const { anchor: hoverAnchor, onHover: handleHover } = useOrbitHover();

    const now = Date.now();

    const filtered = useMemo(() => {
        const lower = search.toLowerCase();
        return devices.filter((device) => {
            if (filter === 'iot' && !device.isIot) return false;
            if (filter === 'new' && !isNewDevice(device, now)) return false;
            if (lower.length > 0) {
                const haystack =
                    `${displayName(device)} ${device.vendor ?? ''} ${device.ip} ${device.mac}`.toLowerCase();
                if (!haystack.includes(lower)) return false;
            }
            return true;
        });
    }, [devices, filter, search, now]);

    // A device filtered out from under the panel must not keep it open.
    const selected = filtered.find((device) => device.mac === selectedMac) ?? null;

    const connectionIndex = useMemo(() => connectionsByRemoteIp(connections), [connections]);
    const deviceConnections = selected ? (connectionIndex.get(selected.ip) ?? []) : [];

    // A device filtered out from under the cursor must not keep its tooltip up.
    const hovered = hoverAnchor ? (filtered.find((d) => d.mac === hoverAnchor.id) ?? null) : null;

    const isNew = useCallback((device: WifiDevice) => isNewDevice(device, now), [now]);

    // A selection made in one mode must not follow into the other: it would keep
    // the panel open and hold the orbit paused until the user clicks empty space.
    const handleModeChange = useCallback(
        (next: typeof mode) => {
            setSelectedMac(null);
            setMode(next);
        },
        [setMode],
    );

    const columns = useMemo(() => deviceColumns(isNew, t), [isNew, t]);

    const filterOptions = useMemo<ReadonlyArray<{ value: DeviceFilter; label: string }>>(
        () => [
            { value: 'all', label: t('devices.filter.all') },
            { value: 'iot', label: t('devices.filter.iot') },
            { value: 'new', label: t('devices.filter.new') },
        ],
        [t],
    );

    // DeviceOrbit owns this while it is mounted; in table mode nothing else would.
    useEffect(() => {
        if (mode !== 'table') return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSelectedMac(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [mode]);

    const handleRename = useCallback(async (mac: string, customName: string | null) => {
        await window.fortis.renameDevice(mac, customName);
    }, []);

    const bannerMessage = devices.length > 0 ? error : null;

    if (error && devices.length === 0) {
        return (
            <div className="page-view">
                <div className="devices-view__error">
                    <AlertCircle size={24} strokeWidth={1.5} />
                    <h3>{t('devices.error.title')}</h3>
                    <p>{error}</p>
                    <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refresh()}>
                        {t('common.retry')}
                    </Button>
                </div>
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
                    placeholder={t('devices.filter.searchPlaceholder')}
                />
                <Select
                    value={filter}
                    options={filterOptions}
                    onChange={setFilter}
                    ariaLabel={t('devices.filter.aria')}
                />
                {mode === 'visual' && (
                    <div className="page-legend">
                        <span className="page-legend__item page-legend__item--lan">
                            {t('devices.legend.devices')}
                        </span>
                        <span className="page-legend__item page-legend__item--iot">
                            {t('devices.legend.iot')}
                        </span>
                    </div>
                )}
                <span className="page-toolbar__count">
                    {t('devices.countFiltered', { filtered: filtered.length, total: devices.length })}
                </span>
                {mode === 'visual' && (
                    <span className="page-toolbar__hint">
                        {selected ? t('devices.hint.selected') : t('devices.hint.orbit')}
                    </span>
                )}
                <ViewToggle mode={mode} onChange={handleModeChange} />
            </div>

            {bannerMessage && (
                <div className="devices-view__banner" role="alert">
                    <AlertCircle size={14} strokeWidth={1.5} />
                    <span className="devices-view__banner-message">{bannerMessage}</span>
                    <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => refresh()}>
                        {t('common.retry')}
                    </Button>
                </div>
            )}

            {filtered.length === 0 ? (
                <EmptyState
                    icon={Wifi}
                    title={
                        isLoading ? t('devices.empty.scanningTitle') : t('devices.empty.noneTitle')
                    }
                    message={
                        isLoading
                            ? t('devices.empty.scanningMessage')
                            : t('devices.empty.noneMessage')
                    }
                />
            ) : (
                <div className="page-stage">
                    {mode === 'table' ? (
                        <div className="page-table">
                            <DataTable
                                rows={filtered}
                                columns={columns}
                                rowKey={(device) => device.mac}
                                label={t('devices.tableAria')}
                                onRowClick={(device) =>
                                    setSelectedMac((prev) => (prev === device.mac ? null : device.mac))
                                }
                                isRowActive={(device) => device.mac === selected?.mac}
                            />
                        </div>
                    ) : (
                        <div className="page-canvas">
                            <DeviceOrbit
                                devices={filtered}
                                selectedMac={selected?.mac ?? null}
                                hoveredMac={hovered?.mac ?? null}
                                isNew={isNew}
                                onSelect={setSelectedMac}
                                onHover={handleHover}
                            />
                        </div>
                    )}

                    {mode === 'visual' && hovered && hoverAnchor && (
                        <DeviceTooltip
                            device={hovered}
                            connections={connectionIndex.get(hovered.ip) ?? []}
                            isNew={isNew(hovered)}
                            anchorX={hoverAnchor.x}
                            anchorY={hoverAnchor.y}
                        />
                    )}

                    {selected && (
                        <aside
                            className="page-panel scrollbar-overlay"
                            aria-label={t('devices.panel.detailsAria')}
                        >
                            <header className="devices-view__panel-head">
                                {selected.isIot ? (
                                    <Router size={18} strokeWidth={1.5} />
                                ) : (
                                    <Wifi size={18} strokeWidth={1.5} />
                                )}
                                <h3>{displayName(selected)}</h3>
                                <button
                                    type="button"
                                    className="devices-view__panel-close"
                                    onClick={() => setSelectedMac(null)}
                                    aria-label={t('devices.panel.closeAria')}
                                >
                                    <X size={16} strokeWidth={1.5} />
                                </button>
                            </header>

                            <div className="devices-view__badges">
                                {isNew(selected) && (
                                    <Badge variant="info" size="sm" showIcon={false}>
                                        {t('devices.badge.new')}
                                    </Badge>
                                )}
                                {selected.isIot && selected.iotCategory && (
                                    <Badge variant="neutral" size="sm" showIcon={false}>
                                        {selected.iotCategory}
                                    </Badge>
                                )}
                                {selected.customName !== null && selected.customName.length > 0 && (
                                    <Badge variant="neutral" size="sm" showIcon={false}>
                                        {t('devices.badge.custom')}
                                    </Badge>
                                )}
                            </div>

                            <dl className="devices-view__facts">
                                <dt>{t('devices.col.vendor')}</dt>
                                <dd>{selected.vendor ?? '—'}</dd>
                                <dt>{t('devices.col.ip')}</dt>
                                <dd>{selected.ip}</dd>
                                <dt>{t('devices.col.mac')}</dt>
                                <dd className="devices-view__mono">{selected.mac}</dd>
                                <dt>{t('devices.firstSeen')}</dt>
                                <dd>{formatTimestamp(selected.firstSeen)}</dd>
                                <dt>{t('devices.col.lastSeen')}</dt>
                                <dd>{formatTimestamp(selected.lastSeen)}</dd>
                            </dl>

                            <Button
                                variant="secondary"
                                size="sm"
                                icon={Pencil}
                                onClick={() => setRenameTarget(selected)}
                            >
                                {t('devices.rename')}
                            </Button>

                            <section className="devices-view__connections">
                                <h4>
                                    {t('devices.panel.connections')}
                                    <span className="devices-view__connections-count">
                                        {deviceConnections.length}
                                    </span>
                                </h4>
                                {deviceConnections.length === 0 ? (
                                    <p className="devices-view__connections-empty">
                                        {t('devices.panel.noConnections', { ip: selected.ip })}
                                    </p>
                                ) : (
                                    <ul>
                                        {deviceConnections.map((connection) => (
                                            <li key={connection.id}>
                                                <span className="devices-view__connection-process">
                                                    {connection.processName}
                                                </span>
                                                <Badge variant="neutral" size="sm" showIcon={false}>
                                                    {connection.state}
                                                </Badge>
                                                <span className="devices-view__connection-route devices-view__mono">
                                                    {connection.protocol}
                                                    {' · :'}
                                                    {connection.localPort}
                                                    {' → :'}
                                                    {connection.remotePort}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        </aside>
                    )}
                </div>
            )}

            {renameTarget && (
                <RenameDeviceDialog
                    mac={renameTarget.mac}
                    initialName={renameTarget.customName ?? ''}
                    fallbackHint={fallbackHint(renameTarget)}
                    isOpen
                    onClose={() => setRenameTarget(null)}
                    onSubmit={handleRename}
                />
            )}
        </div>
    );
}

export default DevicesView;
