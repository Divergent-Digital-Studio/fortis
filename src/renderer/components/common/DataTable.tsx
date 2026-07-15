import { useState, useMemo, type ReactNode } from 'react';
import { ArrowUp } from 'lucide-react';
import EmptyState from './EmptyState';
import '../../styles/components/data-table.css';

type SortDirection = 'asc' | 'desc';

interface Column<T> {
    key: string;
    header: string;
    /** Rendered cell. Falls back to `sortValue` when omitted. */
    render?: (row: T) => ReactNode;
    /** Returning a value makes the column sortable. */
    sortValue?: (row: T) => string | number;
    /** CSS grid track for this column. Defaults to `1fr`. */
    width?: string;
    mono?: boolean;
}

interface DataTableProps<T> {
    rows: readonly T[];
    columns: ReadonlyArray<Column<T>>;
    rowKey: (row: T) => string;
    label: string;
    emptyMessage?: string;
    onRowClick?: (row: T) => void;
    isRowActive?: (row: T) => boolean;
}

function compare(a: string | number, b: string | number): number {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
}

function DataTable<T>({
    rows,
    columns,
    rowKey,
    label,
    emptyMessage = 'Nothing to show yet.',
    onRowClick,
    isRowActive,
}: DataTableProps<T>) {
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [direction, setDirection] = useState<SortDirection>('asc');

    const template = columns.map((column) => column.width ?? '1fr').join(' ');

    const sorted = useMemo(() => {
        const column = columns.find((c) => c.key === sortKey);
        const sortValue = column?.sortValue;
        if (!sortValue) return rows;
        const factor = direction === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => compare(sortValue(a), sortValue(b)) * factor);
    }, [rows, columns, sortKey, direction]);

    const toggleSort = (column: Column<T>) => {
        if (!column.sortValue) return;
        if (sortKey === column.key) {
            setDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
            return;
        }
        setSortKey(column.key);
        setDirection('asc');
    };

    const header = (
        <div className="data-table__row data-table__row--head" role="row" style={{ gridTemplateColumns: template }}>
            {columns.map((column) => {
                const isSortable = column.sortValue !== undefined;
                const isActive = sortKey === column.key;
                return (
                    <span
                        key={column.key}
                        role="columnheader"
                        aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className={[
                            'data-table__header-cell',
                            isSortable ? 'data-table__header-cell--sortable' : '',
                            isActive ? 'data-table__header-cell--active' : '',
                        ]
                            .filter(Boolean)
                            .join(' ')}
                        tabIndex={isSortable ? 0 : undefined}
                        onClick={() => toggleSort(column)}
                        onKeyDown={(event) => {
                            if (!isSortable) return;
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                toggleSort(column);
                            }
                        }}
                    >
                        {column.header}
                        {isActive && (
                            <span
                                className={`data-table__sort-icon ${direction === 'desc' ? 'data-table__sort-icon--desc' : ''}`}
                            >
                                <ArrowUp size={10} strokeWidth={2} />
                            </span>
                        )}
                    </span>
                );
            })}
        </div>
    );

    if (rows.length === 0) {
        return (
            <div className="data-table scrollbar-overlay" role="table" aria-label={label}>
                {header}
                <EmptyState message={emptyMessage} />
            </div>
        );
    }

    return (
        <div className="data-table scrollbar-overlay" role="table" aria-label={label}>
            {header}
            <div role="rowgroup">
                {sorted.map((row) => {
                    const clickable = onRowClick !== undefined;
                    return (
                        <div
                            key={rowKey(row)}
                            role="row"
                            className={[
                                'data-table__row',
                                clickable ? 'data-table__row--clickable' : '',
                                isRowActive?.(row) ? 'data-table__row--active' : '',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                            style={{ gridTemplateColumns: template }}
                            tabIndex={clickable ? 0 : undefined}
                            onClick={clickable ? () => onRowClick(row) : undefined}
                            onKeyDown={
                                clickable
                                    ? (event) => {
                                          if (event.key === 'Enter' || event.key === ' ') {
                                              event.preventDefault();
                                              onRowClick(row);
                                          }
                                      }
                                    : undefined
                            }
                        >
                            {columns.map((column) => (
                                <span
                                    key={column.key}
                                    role="cell"
                                    className={column.mono ? 'data-table__mono' : undefined}
                                >
                                    {column.render ? column.render(row) : String(column.sortValue?.(row) ?? '')}
                                </span>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default DataTable;
export type { DataTableProps, Column };
