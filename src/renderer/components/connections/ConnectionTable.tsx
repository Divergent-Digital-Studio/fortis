import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ArrowUp, Wifi } from 'lucide-react';
import ConnectionRow from './ConnectionRow';
import EmptyState from '../common/EmptyState';
import LoadingSkeleton from '../common/LoadingSkeleton';
import { matchesFilters } from './FilterBar';
import { useConnectionStore } from '../../stores/connection-store';
import { toActionError } from '../../stores/action-error';
import { useI18n } from '../../i18n';
import type { NetworkConnection, WhitelistEntry, ThreatLevel } from '../../types';
import type { ThreatData } from './ConnectionRow';
import type { ProtocolFilter, StateFilter } from './FilterBar';
import '../../styles/components/table.css';

type SortField = 'processName' | 'remoteAddress' | 'remotePort' | 'protocol' | 'state';
type SortDirection = 'asc' | 'desc';

interface ConnectionTableProps {
    connections: NetworkConnection[];
    isLoading: boolean;
    protocolFilter: ProtocolFilter;
    stateFilter: StateFilter;
    searchText: string;
    onActionError?: ((message: string) => void) | undefined;
    onRowSelect?: ((connection: NetworkConnection) => void) | undefined;
    activeAddress?: string | null | undefined;
}

const NEW_CONNECTION_TTL = 5000;

function compareConnections(
    a: NetworkConnection,
    b: NetworkConnection,
    field: SortField,
    direction: SortDirection,
): number {
    let result = 0;

    switch (field) {
        case 'processName':
            result = a.processName.localeCompare(b.processName);
            break;
        case 'remoteAddress':
            result = a.remoteAddress.localeCompare(b.remoteAddress);
            break;
        case 'remotePort':
            result = a.remotePort - b.remotePort;
            break;
        case 'protocol':
            result = a.protocol.localeCompare(b.protocol);
            break;
        case 'state':
            result = a.state.localeCompare(b.state);
            break;
    }

    return direction === 'asc' ? result : -result;
}

function toThreatData(entry: { threatLevel: ThreatLevel | null; confidence: number | null; explanation: string | null; source: 'ai' | 'rule' | null } | undefined): ThreatData | undefined {
    if (!entry) return undefined;
    return {
        threatLevel: entry.threatLevel,
        confidence: entry.confidence,
        explanation: entry.explanation,
        source: entry.source,
    };
}

function ConnectionTable({
    connections,
    isLoading,
    protocolFilter,
    stateFilter,
    searchText,
    onActionError,
    onRowSelect,
    activeAddress,
}: ConnectionTableProps) {
    const { t } = useI18n();
    const [sortField, setSortField] = useState<SortField>('processName');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [newConnectionIds, setNewConnectionIds] = useState<Set<string>>(new Set());
    const previousIdsRef = useRef<Set<string>>(new Set());

    const storeThreatMap = useConnectionStore((s) => s.threatMap);

    const handleMarkAsSafe = useCallback(async (connection: NetworkConnection) => {
        const entry: Omit<WhitelistEntry, 'id' | 'createdAt'> = {
            processName: connection.processName,
            remoteAddress: connection.remoteAddress,
            remotePort: connection.remotePort,
            reason: `Marked as safe from connections table: ${connection.processName} → ${connection.remoteAddress}:${connection.remotePort}`,
            source: 'user',
        };
        try {
            await window.fortis.addToWhitelist(entry);
        } catch (err) {
            onActionError?.(toActionError(err, t('connections.whitelistFailed')));
        }
    }, [onActionError, t]);

    useEffect(() => {
        const currentIds = new Set(connections.map((c) => c.id));
        const prevIds = previousIdsRef.current;
        previousIdsRef.current = currentIds;

        if (prevIds.size === 0) return;

        const freshIds = new Set<string>();
        for (const id of currentIds) {
            if (!prevIds.has(id)) {
                freshIds.add(id);
            }
        }

        if (freshIds.size === 0) return;

        setNewConnectionIds((prev) => {
            const merged = new Set(prev);
            for (const id of freshIds) {
                merged.add(id);
            }
            return merged;
        });

        const timer = setTimeout(() => {
            setNewConnectionIds((prev) => {
                const next = new Set(prev);
                for (const id of freshIds) {
                    next.delete(id);
                }
                return next;
            });
        }, NEW_CONNECTION_TTL);

        return () => clearTimeout(timer);
    }, [connections]);

    const filteredConnections = useMemo(
        () =>
            connections
                .filter((c) => matchesFilters(c, protocolFilter, stateFilter, searchText))
                .sort((a, b) => compareConnections(a, b, sortField, sortDirection)),
        [connections, protocolFilter, stateFilter, searchText, sortField, sortDirection],
    );

    const handleSort = useCallback((field: SortField) => {
        setSortField((prev) => {
            if (prev === field) {
                setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
                return prev;
            }
            setSortDirection('asc');
            return field;
        });
    }, []);

    const renderHeaderCell = useCallback(
        (field: SortField, label: string) => {
            const isActive = sortField === field;
            const classes = [
                'connection-table__header-cell',
                isActive && 'connection-table__header-cell--active',
            ]
                .filter(Boolean)
                .join(' ');

            return (
                <div
                    className={classes}
                    onClick={() => handleSort(field)}
                    role="columnheader"
                    aria-sort={isActive ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSort(field);
                        }
                    }}
                >
                    {label}
                    {isActive && (
                        <span
                            className={`connection-table__sort-icon ${sortDirection === 'desc' ? 'connection-table__sort-icon--desc' : ''
                                }`}
                        >
                            <ArrowUp size={10} strokeWidth={2} />
                        </span>
                    )}
                </div>
            );
        },
        [sortField, sortDirection, handleSort],
    );

    const headerRow = (
        <div className="connection-table__header" role="row">
            {renderHeaderCell('processName', t('connections.col.process'))}
            {renderHeaderCell('remoteAddress', t('connections.col.remoteAddress'))}
            {renderHeaderCell('remotePort', t('connections.col.port'))}
            {renderHeaderCell('protocol', t('connections.col.protocol'))}
            {renderHeaderCell('state', t('connections.col.state'))}
            <div className="connection-table__header-cell">{t('connections.col.threat')}</div>
        </div>
    );

    if (isLoading) {
        return (
            <div className="connection-table">
                {headerRow}
                <div className="connection-table__loading">
                    <LoadingSkeleton height={40} count={8} shape="rounded" />
                </div>
            </div>
        );
    }

    if (connections.length === 0) {
        return (
            <div className="connection-table">
                {headerRow}
                <div className="connection-table__empty">
                    <EmptyState
                        icon={Wifi}
                        title={t('connections.empty.title')}
                        message={t('connections.empty.message')}
                    />
                </div>
            </div>
        );
    }

    if (filteredConnections.length === 0) {
        return (
            <div className="connection-table">
                {headerRow}
                <div className="connection-table__empty">
                    <EmptyState
                        message={t('connections.noMatch')}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="connection-table">
            {headerRow}

            <div className="connection-table__body scrollbar-overlay" role="rowgroup">
                {filteredConnections.map((connection) => (
                    <ConnectionRow
                        key={connection.id}
                        connection={connection}
                        isNew={newConnectionIds.has(connection.id)}
                        threatData={toThreatData(storeThreatMap.get(connection.id))}
                        onMarkAsSafe={handleMarkAsSafe}
                        onSelect={onRowSelect}
                        isActive={activeAddress !== null && connection.remoteAddress === activeAddress}
                    />
                ))}
            </div>
        </div>
    );
}

export default ConnectionTable;
export type { ConnectionTableProps, SortField, SortDirection };
