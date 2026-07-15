import { useState, useCallback, useMemo, useEffect } from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';
import FilterBar, { matchesFilters } from './FilterBar';
import ConnectionTable from './ConnectionTable';
import ConnectionDetail from './ConnectionDetail';
import ConnectionHoverCard from './ConnectionHoverCard';
import { Button, ViewToggle, HubOrbit, type HubNode } from '../common';
import useConnections from '../../hooks/useConnections';
import useViewMode from '../../hooks/useViewMode';
import useOrbitHover from '../../hooks/useOrbitHover';
import { useI18n } from '../../i18n';
import type { NetworkConnection } from '../../types';
import type { ProtocolFilter, StateFilter } from './FilterBar';
import '../../styles/components/connections-view.css';

/**
 * One node per remote address, sized by how many sockets reach it. Plotting raw
 * sockets would stack hundreds of nodes on the same point.
 */
function toOrbitNodes(connections: NetworkConnection[]): HubNode[] {
    const counts = new Map<string, number>();
    for (const connection of connections) {
        counts.set(connection.remoteAddress, (counts.get(connection.remoteAddress) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const half = Math.ceil(sorted.length / 2);
    return sorted.map(([address, count], index) => ({
        id: address,
        label: address,
        weight: count,
        outer: index >= half,
    }));
}

function ConnectionsView() {
    const { t } = useI18n();
    const { connections, isLoading, error, refresh } = useConnections();

    const [mode, setMode] = useViewMode('connections');
    const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>('all');
    const [stateFilter, setStateFilter] = useState<StateFilter>('all');
    const [searchText, setSearchText] = useState('');
    const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const { anchor, hoveredId, onHover } = useOrbitHover();

    const filtered = useMemo(
        () => connections.filter((c) => matchesFilters(c, protocolFilter, stateFilter, searchText)),
        [connections, protocolFilter, stateFilter, searchText],
    );
    const filteredCount = filtered.length;

    const orbitNodes = useMemo(() => toOrbitNodes(filtered), [filtered]);

    // A destination filtered out from under the panel must not keep it open.
    const selected = selectedAddress !== null && orbitNodes.some((n) => n.id === selectedAddress)
        ? selectedAddress
        : null;

    const selectedConnections = useMemo(
        () => (selected === null ? [] : filtered.filter((c) => c.remoteAddress === selected)),
        [filtered, selected],
    );

    // A destination filtered out from under the cursor must not keep its tooltip up.
    const hovered = hoveredId !== null && orbitNodes.some((n) => n.id === hoveredId) ? hoveredId : null;

    const hoveredConnections = useMemo(
        () => (hovered === null ? [] : filtered.filter((c) => c.remoteAddress === hovered)),
        [filtered, hovered],
    );

    const handleRetry = useCallback(() => {
        refresh();
    }, [refresh]);

    // A selection made in one mode must not follow into the other: it would keep
    // the panel open and hold the orbit paused until the user clicks empty space.
    const handleModeChange = useCallback(
        (next: typeof mode) => {
            setSelectedAddress(null);
            setMode(next);
        },
        [setMode],
    );

    const handleRowSelect = useCallback((connection: NetworkConnection) => {
        setSelectedAddress((prev) =>
            prev === connection.remoteAddress ? null : connection.remoteAddress,
        );
    }, []);

    // HubOrbit owns the canvas while it is mounted; in table mode nothing else would.
    useEffect(() => {
        if (mode !== 'table') return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSelectedAddress(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [mode]);

    const bannerMessage = actionError ?? (connections.length > 0 ? error : null);

    if (error && connections.length === 0) {
        return (
            <div className="page-view">
                <div className="connections-view__error">
                    <AlertCircle size={24} strokeWidth={1.5} className="connections-view__error-icon" />
                    <h3 className="connections-view__error-title">{t('connections.error.title')}</h3>
                    <p className="connections-view__error-message">{error}</p>
                    <Button
                        variant="secondary"
                        size="sm"
                        icon={RefreshCw}
                        onClick={handleRetry}
                    >
                        {t('common.retry')}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="page-view">
            <div className="page-toolbar">
                <FilterBar
                    protocol={protocolFilter}
                    state={stateFilter}
                    search={searchText}
                    totalCount={connections.length}
                    filteredCount={filteredCount}
                    onProtocolChange={setProtocolFilter}
                    onStateChange={setStateFilter}
                    onSearchChange={setSearchText}
                />
                {mode === 'visual' && (
                    <span className="page-toolbar__hint">
                        {selected ? t('connections.hint.selected') : t('connections.hint.orbit')}
                    </span>
                )}
                <ViewToggle mode={mode} onChange={handleModeChange} />
            </div>

            {bannerMessage && (
                <div className="connections-view__banner" role="alert">
                    <AlertCircle size={14} strokeWidth={1.5} />
                    <span className="connections-view__banner-message">{bannerMessage}</span>
                    {actionError ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={X}
                            onClick={() => setActionError(null)}
                            aria-label={t('common.dismiss')}
                        >
                            {t('common.dismiss')}
                        </Button>
                    ) : (
                        <Button variant="ghost" size="sm" icon={RefreshCw} onClick={handleRetry}>
                            {t('common.retry')}
                        </Button>
                    )}
                </div>
            )}

            {mode === 'table' ? (
                <div className="page-stage">
                    <div className="page-table">
                        <ConnectionTable
                            connections={connections}
                            isLoading={isLoading}
                            protocolFilter={protocolFilter}
                            stateFilter={stateFilter}
                            searchText={searchText}
                            onActionError={setActionError}
                            onRowSelect={handleRowSelect}
                            activeAddress={selected}
                        />
                    </div>

                    {selected && (
                        <ConnectionDetail
                            address={selected}
                            connections={selectedConnections}
                            onClose={() => setSelectedAddress(null)}
                        />
                    )}
                </div>
            ) : (
                <div className="page-stage">
                    <div className="page-canvas">
                        <HubOrbit
                            nodes={orbitNodes}
                            hubLabel={t('connections.hubLabel')}
                            selectedId={selected}
                            onSelect={setSelectedAddress}
                            ariaLabel={t('connections.orbitAria')}
                            onHover={onHover}
                            hoveredId={hovered}
                        />
                    </div>

                    {hovered && anchor && (
                        <ConnectionHoverCard
                            address={hovered}
                            connections={hoveredConnections}
                            anchorX={anchor.x}
                            anchorY={anchor.y}
                        />
                    )}

                    {selected && (
                        <ConnectionDetail
                            address={selected}
                            connections={selectedConnections}
                            onClose={() => setSelectedAddress(null)}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

export default ConnectionsView;
