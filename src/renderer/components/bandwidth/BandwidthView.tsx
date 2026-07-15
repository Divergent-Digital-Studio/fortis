import { useState, useMemo, useCallback, useEffect } from 'react';
import { Activity, AlertCircle, ArrowDown, ArrowUp, RefreshCw, X } from 'lucide-react';
import {
    Button,
    EmptyState,
    ViewToggle,
    DataTable,
    HubOrbit,
    OrbitTooltip,
    type Column,
    type HubNode,
} from '../common';
import useBandwidth from '../../hooks/useBandwidth';
import useViewMode from '../../hooks/useViewMode';
import useOrbitHover from '../../hooks/useOrbitHover';
import { useI18n } from '../../i18n';
import type { ProcessBandwidth } from '@shared/types/m3';
import '../../styles/components/bandwidth-view.css';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const UNITS = ['B/s', 'KB/s', 'MB/s', 'GB/s'] as const;

function humanizeRate(bytesPerSec: number): string {
    if (bytesPerSec <= 0) return '0 B/s';
    let value = bytesPerSec;
    let unit = 0;
    while (value >= 1024 && unit < UNITS.length - 1) {
        value /= 1024;
        unit += 1;
    }
    const formatted = unit === 0 ? Math.round(value).toString() : value.toFixed(1);
    return `${formatted} ${UNITS[unit]}`;
}

function totalRate(process: ProcessBandwidth): number {
    return process.bytesInPerSec + process.bytesOutPerSec;
}

function bandwidthColumns(t: Translate): ReadonlyArray<Column<ProcessBandwidth>> {
    return [
        {
            key: 'processName',
            header: t('bandwidth.col.process'),
            width: '2fr',
            sortValue: (process) => process.processName,
        },
        {
            key: 'pid',
            header: t('bandwidth.col.pid'),
            width: '0.7fr',
            mono: true,
            sortValue: (process) => process.pid,
        },
        {
            key: 'in',
            header: t('bandwidth.col.download'),
            width: '1fr',
            sortValue: (process) => process.bytesInPerSec,
            render: (process) => humanizeRate(process.bytesInPerSec),
        },
        {
            key: 'out',
            header: t('bandwidth.col.upload'),
            width: '1fr',
            sortValue: (process) => process.bytesOutPerSec,
            render: (process) => humanizeRate(process.bytesOutPerSec),
        },
        {
            key: 'total',
            header: t('bandwidth.col.total'),
            width: '1fr',
            sortValue: totalRate,
            render: (process) => humanizeRate(totalRate(process)),
        },
    ];
}

/** Uploaders sit on the outer ring; node size tracks total throughput. */
function toOrbitNodes(processes: ProcessBandwidth[]): HubNode[] {
    return processes.map((process) => ({
        id: String(process.pid),
        label: process.processName,
        weight: totalRate(process),
        outer: process.bytesOutPerSec > process.bytesInPerSec,
    }));
}

function ProcessPanel({ process, onClose }: { process: ProcessBandwidth; onClose: () => void }) {
    const { t } = useI18n();
    return (
        <aside className="page-panel scrollbar-overlay" aria-label={t('bandwidth.panel.detailsAria')}>
            <header className="bandwidth-view__panel-head">
                <Activity size={18} strokeWidth={1.5} />
                <h3>{process.processName}</h3>
                <button
                    type="button"
                    className="bandwidth-view__panel-close"
                    onClick={onClose}
                    aria-label={t('bandwidth.panel.closeAria')}
                >
                    <X size={16} strokeWidth={1.5} />
                </button>
            </header>

            <dl className="bandwidth-view__facts">
                <dt>{t('bandwidth.col.pid')}</dt>
                <dd className="bandwidth-view__mono">{process.pid}</dd>
                <dt>{t('bandwidth.col.download')}</dt>
                <dd>{humanizeRate(process.bytesInPerSec)}</dd>
                <dt>{t('bandwidth.col.upload')}</dt>
                <dd>{humanizeRate(process.bytesOutPerSec)}</dd>
                <dt>{t('bandwidth.col.total')}</dt>
                <dd>{humanizeRate(totalRate(process))}</dd>
            </dl>
        </aside>
    );
}

function BandwidthHoverCard({
    process,
    anchorX,
    anchorY,
}: {
    process: ProcessBandwidth;
    anchorX: number;
    anchorY: number;
}) {
    const { t } = useI18n();
    return (
        <OrbitTooltip anchorX={anchorX} anchorY={anchorY} contentKey={String(process.pid)}>
            <div className="orbit-tooltip__head">
                <span className="orbit-tooltip__name">{process.processName}</span>
            </div>

            <dl className="orbit-tooltip__facts">
                <dt>{t('bandwidth.col.pid')}</dt>
                <dd className="orbit-tooltip__mono">{process.pid}</dd>
                <dt>{t('bandwidth.col.download')}</dt>
                <dd>{humanizeRate(process.bytesInPerSec)}</dd>
                <dt>{t('bandwidth.col.upload')}</dt>
                <dd>{humanizeRate(process.bytesOutPerSec)}</dd>
                <dt>{t('bandwidth.col.total')}</dt>
                <dd>{humanizeRate(totalRate(process))}</dd>
            </dl>
        </OrbitTooltip>
    );
}

function BandwidthView() {
    const { t, tn } = useI18n();
    const { snapshot, isLoading, error, refresh } = useBandwidth();
    const [mode, setMode] = useViewMode('bandwidth');
    const [selectedPid, setSelectedPid] = useState<string | null>(null);
    const { anchor, hoveredId, onHover } = useOrbitHover();

    const columns = useMemo(() => bandwidthColumns(t), [t]);
    const orbitNodes = useMemo(() => toOrbitNodes(snapshot.processes), [snapshot.processes]);
    const selected = snapshot.processes.find((process) => String(process.pid) === selectedPid) ?? null;
    const hovered = snapshot.processes.find((process) => String(process.pid) === hoveredId) ?? null;

    // A selection made in one mode must not follow into the other: it would keep
    // the panel open and hold the orbit paused until the user clicks empty space.
    const handleModeChange = useCallback(
        (next: typeof mode) => {
            setSelectedPid(null);
            setMode(next);
        },
        [setMode],
    );

    // HubOrbit owns the canvas while it is mounted; in table mode nothing else would.
    useEffect(() => {
        if (mode !== 'table') return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSelectedPid(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [mode]);

    const totals = useMemo(
        () =>
            snapshot.processes.reduce(
                (sum, process) => ({
                    down: sum.down + process.bytesInPerSec,
                    up: sum.up + process.bytesOutPerSec,
                }),
                { down: 0, up: 0 },
            ),
        [snapshot.processes],
    );

    if (error && snapshot.processes.length === 0) {
        return (
            <div className="page-view">
                <div className="bandwidth-view__error">
                    <AlertCircle size={24} strokeWidth={1.5} />
                    <h3>{t('bandwidth.error.title')}</h3>
                    <p>{error}</p>
                    <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refresh()}>
                        {t('common.retry')}
                    </Button>
                </div>
            </div>
        );
    }

    if (snapshot.status === 'unsupported') {
        return (
            <div className="page-view">
                <EmptyState
                    icon={Activity}
                    title={t('bandwidth.empty.unsupportedTitle')}
                    message={t('bandwidth.empty.unsupportedMessage')}
                />
            </div>
        );
    }

    if (snapshot.status === 'sampling') {
        return (
            <div className="page-view">
                <EmptyState
                    icon={Activity}
                    title={
                        isLoading
                            ? t('bandwidth.empty.loadingTitle')
                            : t('bandwidth.empty.samplingTitle')
                    }
                    message={t('bandwidth.empty.samplingMessage')}
                />
            </div>
        );
    }

    if (snapshot.processes.length === 0) {
        return (
            <div className="page-view">
                <EmptyState
                    icon={Activity}
                    title={t('bandwidth.empty.title')}
                    message={t('bandwidth.empty.message')}
                />
            </div>
        );
    }

    return (
        <div className="page-view">
            <div className="page-toolbar">
                {mode === 'visual' && (
                    <div className="page-legend">
                        <span className="page-legend__item page-legend__item--lan">
                            {t('bandwidth.legend.downloading')}
                        </span>
                        <span className="page-legend__item page-legend__item--outer">
                            {t('bandwidth.legend.uploading')}
                        </span>
                    </div>
                )}
                <span className="page-toolbar__count">
                    {tn('bandwidth.count', snapshot.processes.length)}
                </span>
                <span className="bandwidth-view__totals">
                    <span
                        className="bandwidth-view__rate"
                        aria-label={t('bandwidth.totalDownloadAria', {
                            rate: humanizeRate(totals.down),
                        })}
                    >
                        <ArrowDown size={14} strokeWidth={1.5} aria-hidden="true" />
                        {humanizeRate(totals.down)}
                    </span>
                    <span
                        className="bandwidth-view__rate"
                        aria-label={t('bandwidth.totalUploadAria', {
                            rate: humanizeRate(totals.up),
                        })}
                    >
                        <ArrowUp size={14} strokeWidth={1.5} aria-hidden="true" />
                        {humanizeRate(totals.up)}
                    </span>
                </span>
                {mode === 'visual' && (
                    <span className="page-toolbar__hint">
                        {selected ? t('bandwidth.hint.selected') : t('bandwidth.hint.orbit')}
                    </span>
                )}
                <ViewToggle mode={mode} onChange={handleModeChange} />
            </div>

            {error && (
                <div className="bandwidth-view__banner" role="alert">
                    <AlertCircle size={14} strokeWidth={1.5} />
                    <span className="bandwidth-view__banner-message">{error}</span>
                    <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => refresh()}>
                        {t('common.retry')}
                    </Button>
                </div>
            )}

            <div className="page-stage">
                {mode === 'table' ? (
                    <div className="page-table">
                        <DataTable
                            rows={snapshot.processes}
                            columns={columns}
                            rowKey={(process) => String(process.pid)}
                            label={t('bandwidth.tableAria')}
                            onRowClick={(process) =>
                                setSelectedPid((prev) =>
                                    prev === String(process.pid) ? null : String(process.pid),
                                )
                            }
                            isRowActive={(process) => String(process.pid) === selectedPid}
                        />
                    </div>
                ) : (
                    <div className="page-canvas">
                        <HubOrbit
                            nodes={orbitNodes}
                            hubLabel={t('bandwidth.hubLabel')}
                            selectedId={selected ? String(selected.pid) : null}
                            onSelect={setSelectedPid}
                            ariaLabel={t('bandwidth.orbitAria')}
                            onHover={onHover}
                            hoveredId={hovered ? String(hovered.pid) : null}
                        />
                    </div>
                )}

                {mode === 'visual' && hovered && anchor && (
                    <BandwidthHoverCard process={hovered} anchorX={anchor.x} anchorY={anchor.y} />
                )}

                {selected && (
                    <ProcessPanel process={selected} onClose={() => setSelectedPid(null)} />
                )}
            </div>
        </div>
    );
}

export default BandwidthView;
