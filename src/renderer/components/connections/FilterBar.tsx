import { useMemo } from 'react';
import SearchInput from '../common/SearchInput';
import Select from '../common/Select';
import { useI18n } from '../../i18n';
import type { SelectOption } from '../common/Select';
import type { NetworkConnection, Protocol, ConnectionState } from '../../types';
import '../../styles/components/table.css';

type ProtocolFilter = Protocol | 'all';
type StateFilter = ConnectionState | 'all';

const STATE_LABELS: ReadonlyArray<{ value: ConnectionState; label: string }> = [
    { value: 'ESTABLISHED', label: 'Established' },
    { value: 'LISTEN', label: 'Listen' },
    { value: 'TIME_WAIT', label: 'Time Wait' },
    { value: 'CLOSE_WAIT', label: 'Close Wait' },
    { value: 'SYN_SENT', label: 'Syn Sent' },
    { value: 'SYN_RECV', label: 'Syn Recv' },
    { value: 'FIN_WAIT1', label: 'Fin Wait 1' },
    { value: 'FIN_WAIT2', label: 'Fin Wait 2' },
    { value: 'CLOSING', label: 'Closing' },
    { value: 'LAST_ACK', label: 'Last Ack' },
    { value: 'CLOSED', label: 'Closed' },
];

function matchesFilters(
    connection: NetworkConnection,
    protocol: ProtocolFilter,
    state: StateFilter,
    search: string,
): boolean {
    if (protocol !== 'all' && connection.protocol !== protocol) return false;
    if (state !== 'all' && connection.state !== state) return false;
    if (search.length > 0) {
        const lower = search.toLowerCase();
        if (
            !connection.processName.toLowerCase().includes(lower) &&
            !connection.remoteAddress.toLowerCase().includes(lower)
        ) {
            return false;
        }
    }
    return true;
}

interface FilterBarProps {
    protocol: ProtocolFilter;
    state: StateFilter;
    search: string;
    totalCount: number;
    filteredCount: number;
    onProtocolChange: (protocol: ProtocolFilter) => void;
    onStateChange: (state: StateFilter) => void;
    onSearchChange: (search: string) => void;
}

function FilterBar({
    protocol,
    state,
    search,
    totalCount,
    filteredCount,
    onProtocolChange,
    onStateChange,
    onSearchChange,
}: FilterBarProps) {
    const { t, tn } = useI18n();
    const isFiltered = protocol !== 'all' || state !== 'all' || search.length > 0;

    const protocolOptions = useMemo<ReadonlyArray<SelectOption<ProtocolFilter>>>(
        () => [
            { value: 'all', label: t('connections.filter.allProtocols') },
            { value: 'tcp', label: 'TCP' },
            { value: 'udp', label: 'UDP' },
        ],
        [t],
    );

    const stateOptions = useMemo<ReadonlyArray<SelectOption<StateFilter>>>(
        () => [
            { value: 'all', label: t('connections.filter.allStates') },
            ...STATE_LABELS,
        ],
        [t],
    );

    return (
        <div className="filter-bar">
            <Select
                className="filter-bar__select"
                value={protocol}
                options={protocolOptions}
                onChange={onProtocolChange}
                ariaLabel={t('connections.filter.protocolAria')}
            />

            <Select
                className="filter-bar__select"
                value={state}
                options={stateOptions}
                onChange={onStateChange}
                ariaLabel={t('connections.filter.stateAria')}
            />

            <div className="filter-bar__search">
                <SearchInput
                    value={search}
                    onChange={onSearchChange}
                    placeholder={t('connections.filter.searchPlaceholder')}
                    compact
                />
            </div>

            <span className="filter-bar__count">
                {isFiltered
                    ? t('connections.countFiltered', { filtered: filteredCount, total: totalCount })
                    : tn('connections.count', totalCount)}
            </span>
        </div>
    );
}

export default FilterBar;
export { matchesFilters };
export type { FilterBarProps, ProtocolFilter, StateFilter };
