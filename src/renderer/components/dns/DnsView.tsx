import { useState, useMemo, useCallback, useEffect } from 'react';
import { Globe, AlertCircle, RefreshCw, X } from 'lucide-react';
import {
    Button,
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
import useDnsQueries from '../../hooks/useDnsQueries';
import { useI18n } from '../../i18n';
import useViewMode from '../../hooks/useViewMode';
import useOrbitHover from '../../hooks/useOrbitHover';
import { domainGroup } from '@shared/utils/domain-group';
import type { DnsQueryRecord } from '@shared/types/m1';
import '../../styles/components/dns-view.css';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function formatTimestamp(value: number): string {
    return new Date(value).toLocaleString();
}

function dnsColumns(t: Translate): ReadonlyArray<Column<DnsQueryRecord>> {
    return [
        {
            key: 'domain',
            header: t('dns.col.domain'),
            width: '2.2fr',
            sortValue: (record) => record.domain,
            render: (record) => (
                <span className="dns-view__domain">
                    <Globe size={16} strokeWidth={1.5} />
                    <span>{record.domain}</span>
                </span>
            ),
        },
        {
            key: 'resolvedIp',
            header: t('dns.col.resolvedIp'),
            width: '1.6fr',
            mono: true,
            sortValue: (record) => record.resolvedIp ?? '',
            render: (record) => record.resolvedIp ?? '—',
        },
        {
            key: 'source',
            header: t('dns.col.source'),
            width: '0.9fr',
            sortValue: (record) => record.source,
            render: (record) => (
                <Badge variant={record.source === 'ptr' ? 'info' : 'neutral'} size="sm" showIcon={false}>
                    {record.source}
                </Badge>
            ),
        },
        {
            key: 'processName',
            header: t('dns.col.process'),
            width: '1.4fr',
            sortValue: (record) => record.processName ?? '',
            render: (record) => record.processName ?? '—',
        },
        { key: 'hitCount', header: t('dns.col.hits'), width: '0.6fr', sortValue: (record) => record.hitCount },
        {
            key: 'lastSeen',
            header: t('dns.col.lastSeen'),
            width: '1.4fr',
            sortValue: (record) => record.lastSeen,
            render: (record) => formatTimestamp(record.lastSeen),
        },
    ];
}

interface DomainGroup {
    key: string;
    records: DnsQueryRecord[];
    hits: number;
    /** A group is PTR-only when every record in it came from a reverse lookup. */
    ptrOnly: boolean;
}

/**
 * Reverse lookups mint one hostname per IP, so a busy machine resolves hundreds
 * of `ec2-*.compute.amazonaws.com` siblings. Plotting each would bury the orbit,
 * so records collapse onto their parent domain and the panel lists the members.
 */
function groupRecords(records: DnsQueryRecord[]): DomainGroup[] {
    const groups = new Map<string, DomainGroup>();

    for (const record of records) {
        const key = domainGroup(record.domain);
        const existing = groups.get(key);
        if (existing) {
            existing.records.push(record);
            existing.hits += record.hitCount;
            existing.ptrOnly = existing.ptrOnly && record.source === 'ptr';
        } else {
            groups.set(key, {
                key,
                records: [record],
                hits: record.hitCount,
                ptrOnly: record.source === 'ptr',
            });
        }
    }

    return [...groups.values()].sort((a, b) => b.hits - a.hits);
}

/** Domains this machine looked up sit inside; reverse-only lookups sit outside. */
function toOrbitNodes(groups: DomainGroup[]): HubNode[] {
    return groups.map((group) => ({
        id: group.key,
        label: group.records.length > 1 ? `${group.key} (${group.records.length})` : group.key,
        weight: group.hits,
        outer: group.ptrOnly,
    }));
}

/** Members listed before the panel turns into an unreadable wall of hostnames. */
const MAX_PANEL_MEMBERS = 50;

function RecordFacts({ record }: { record: DnsQueryRecord }) {
    const { t } = useI18n();
    return (
        <dl className="dns-view__facts">
            <dt>{t('dns.col.resolvedIp')}</dt>
            <dd className="dns-view__mono">{record.resolvedIp ?? '—'}</dd>
            <dt>{t('dns.col.source')}</dt>
            <dd>{record.source}</dd>
            <dt>{t('dns.col.process')}</dt>
            <dd>{record.processName ?? '—'}</dd>
            <dt>{t('dns.col.hits')}</dt>
            <dd>{record.hitCount}</dd>
            <dt>{t('dns.firstSeen')}</dt>
            <dd>{formatTimestamp(record.firstSeen)}</dd>
            <dt>{t('dns.col.lastSeen')}</dt>
            <dd>{formatTimestamp(record.lastSeen)}</dd>
        </dl>
    );
}

function RecordPanel({ record, onClose }: { record: DnsQueryRecord; onClose: () => void }) {
    const { t } = useI18n();
    return (
        <aside className="page-panel scrollbar-overlay" aria-label={t('dns.panel.detailsAria')}>
            <header className="dns-view__panel-head">
                <Globe size={18} strokeWidth={1.5} />
                <h3>{record.domain}</h3>
                <button
                    type="button"
                    className="dns-view__panel-close"
                    onClick={onClose}
                    aria-label={t('dns.panel.closeAria')}
                >
                    <X size={16} strokeWidth={1.5} />
                </button>
            </header>
            <RecordFacts record={record} />
        </aside>
    );
}

function DomainPanel({ group }: { group: DomainGroup }) {
    const { t } = useI18n();
    const members = useMemo(
        () => [...group.records].sort((a, b) => b.hitCount - a.hitCount),
        [group.records],
    );
    const shown = members.slice(0, MAX_PANEL_MEMBERS);
    const hidden = members.length - shown.length;
    const [only] = members;

    return (
        <aside className="page-panel scrollbar-overlay" aria-label={t('dns.panel.detailsAria')}>
            <h3 className="dns-view__panel-domain">{group.key}</h3>

            {members.length === 1 && only !== undefined ? (
                <RecordFacts record={only} />
            ) : (
                <>
                    <dl className="dns-view__facts">
                        <dt>{t('dns.hostnames')}</dt>
                        <dd>{group.records.length}</dd>
                        <dt>{t('dns.totalHits')}</dt>
                        <dd>{group.hits}</dd>
                        <dt>{t('dns.col.source')}</dt>
                        <dd>{group.ptrOnly ? 'ptr' : t('dns.source.mixed')}</dd>
                    </dl>

                    <section className="dns-view__members">
                        <h4>{t('dns.hostnames')}</h4>
                        <ul>
                            {shown.map((record) => (
                                <li key={record.id}>
                                    <span className="dns-view__member-name">{record.domain}</span>
                                    <Badge variant="neutral" size="sm" showIcon={false}>
                                        {record.hitCount}
                                    </Badge>
                                </li>
                            ))}
                        </ul>
                        {hidden > 0 && (
                            <p className="dns-view__members-more">
                                {t('dns.members.more', { count: hidden })}
                            </p>
                        )}
                    </section>
                </>
            )}
        </aside>
    );
}

/** Member hostnames previewed on hover before the tooltip grows unreadable. */
const HOVER_MEMBER_LIMIT = 4;

function DomainHoverCard({
    group,
    anchorX,
    anchorY,
}: {
    group: DomainGroup;
    anchorX: number;
    anchorY: number;
}) {
    const { t } = useI18n();
    const members = [...group.records].sort((a, b) => b.hitCount - a.hitCount);
    const [only] = members;
    const single = members.length === 1 && only !== undefined;
    const shown = members.slice(0, HOVER_MEMBER_LIMIT);
    const hidden = members.length - shown.length;

    return (
        <OrbitTooltip anchorX={anchorX} anchorY={anchorY} contentKey={`${group.key}:${members.length}`}>
            <div className="orbit-tooltip__head">
                <span className="orbit-tooltip__name">{group.key}</span>
                <Badge variant={group.ptrOnly ? 'info' : 'neutral'} size="sm" showIcon={false}>
                    {group.ptrOnly ? 'ptr' : t('dns.source.mixed')}
                </Badge>
            </div>

            {single ? (
                <dl className="orbit-tooltip__facts">
                    <dt>{t('dns.col.resolvedIp')}</dt>
                    <dd className="orbit-tooltip__mono">{only.resolvedIp ?? '—'}</dd>
                    <dt>{t('dns.col.source')}</dt>
                    <dd>{only.source}</dd>
                    <dt>{t('dns.col.process')}</dt>
                    <dd>{only.processName ?? '—'}</dd>
                    <dt>{t('dns.col.hits')}</dt>
                    <dd>{only.hitCount}</dd>
                    <dt>{t('dns.firstSeen')}</dt>
                    <dd>{formatTimestamp(only.firstSeen)}</dd>
                    <dt>{t('dns.col.lastSeen')}</dt>
                    <dd>{formatTimestamp(only.lastSeen)}</dd>
                </dl>
            ) : (
                <>
                    <dl className="orbit-tooltip__facts">
                        <dt>{t('dns.hostnames')}</dt>
                        <dd>{members.length}</dd>
                        <dt>{t('dns.totalHits')}</dt>
                        <dd>{group.hits}</dd>
                    </dl>

                    <div className="orbit-tooltip__section">
                        <span className="orbit-tooltip__section-head">{t('dns.hostnames')}</span>
                        {shown.map((record) => (
                            <span key={record.id} className="orbit-tooltip__row">
                                <span className="orbit-tooltip__row-name orbit-tooltip__mono">
                                    {record.domain}
                                </span>
                                <span className="orbit-tooltip__row-meta">{record.hitCount}</span>
                            </span>
                        ))}
                        {hidden > 0 && (
                            <span className="orbit-tooltip__more">
                                {t('dns.tooltip.more', { count: hidden })}
                            </span>
                        )}
                    </div>
                </>
            )}
        </OrbitTooltip>
    );
}

function DnsView() {
    const { t } = useI18n();
    const { records, isLoading, error, refresh } = useDnsQueries();
    const [mode, setMode] = useViewMode('dns');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
    const { anchor, hoveredId, onHover } = useOrbitHover();

    const filtered = useMemo(() => {
        const lower = search.toLowerCase();
        if (lower.length === 0) return records;
        return records.filter((record) => {
            const haystack = `${record.domain} ${record.resolvedIp ?? ''} ${record.processName ?? ''}`.toLowerCase();
            return haystack.includes(lower);
        });
    }, [records, search]);

    const groups = useMemo(() => groupRecords(filtered), [filtered]);
    const orbitNodes = useMemo(() => toOrbitNodes(groups), [groups]);

    const columns = useMemo(() => dnsColumns(t), [t]);

    // A selection made in one mode must not follow into the other: it would
    // reopen the panel and confuse the orbit the next time the user returns.
    const handleModeChange = useCallback(
        (next: typeof mode) => {
            setSelectedId(null);
            setSelectedRecordId(null);
            setMode(next);
        },
        [setMode],
    );

    // HubOrbit owns the canvas while it is mounted; in table mode nothing else would.
    useEffect(() => {
        if (mode !== 'table') return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSelectedRecordId(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [mode]);

    // A group filtered out from under the selection must not stay selected.
    const selected = groups.find((group) => group.key === selectedId) ?? null;

    // A record filtered out from under the panel must not keep it open.
    const selectedRecord = filtered.find((record) => record.id === selectedRecordId) ?? null;

    // A group filtered out from under the cursor must not keep its tooltip up.
    const hovered = groups.find((group) => group.key === hoveredId) ?? null;

    if (error && records.length === 0) {
        return (
            <div className="page-view">
                <div className="dns-view__error">
                    <AlertCircle size={24} strokeWidth={1.5} />
                    <h3>{t('dns.error.title')}</h3>
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
                    placeholder={t('dns.searchPlaceholder')}
                />
                <span className="page-toolbar__count">
                    {mode === 'visual'
                        ? t('dns.countVisual', { domains: groups.length, queries: filtered.length })
                        : t('dns.countFiltered', { filtered: filtered.length, total: records.length })}
                </span>
                {mode === 'visual' && (
                    <span className="page-toolbar__hint">
                        {selected ? t('dns.hint.selected') : t('dns.hint.orbit')}
                    </span>
                )}
                <ViewToggle mode={mode} onChange={handleModeChange} />
            </div>

            {error && records.length > 0 && (
                <div className="dns-view__banner" role="alert">
                    <AlertCircle size={14} strokeWidth={1.5} />
                    <span className="dns-view__banner-message">{error}</span>
                    <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => refresh()}>
                        {t('common.retry')}
                    </Button>
                </div>
            )}

            {filtered.length === 0 ? (
                <EmptyState
                    icon={Globe}
                    title={isLoading ? t('dns.empty.loadingTitle') : t('dns.empty.title')}
                    message={isLoading ? t('dns.empty.loadingMessage') : t('dns.empty.message')}
                />
            ) : (
                <div className="page-stage">
                    {mode === 'table' ? (
                        <div className="page-table">
                            <DataTable
                                rows={filtered}
                                columns={columns}
                                rowKey={(record) => record.id}
                                label={t('dns.tableAria')}
                                onRowClick={(record) =>
                                    setSelectedRecordId((prev) =>
                                        prev === record.id ? null : record.id,
                                    )
                                }
                                isRowActive={(record) => record.id === selectedRecord?.id}
                            />
                        </div>
                    ) : (
                        <div className="page-canvas">
                            <HubOrbit
                                nodes={orbitNodes}
                                hubLabel={t('dns.hubLabel')}
                                selectedId={selected?.key ?? null}
                                onSelect={setSelectedId}
                                ariaLabel={t('dns.orbitAria')}
                                onHover={onHover}
                                hoveredId={hovered?.key ?? null}
                            />
                        </div>
                    )}

                    {mode === 'visual' && hovered && anchor && (
                        <DomainHoverCard group={hovered} anchorX={anchor.x} anchorY={anchor.y} />
                    )}

                    {mode === 'table' && selectedRecord && (
                        <RecordPanel
                            record={selectedRecord}
                            onClose={() => setSelectedRecordId(null)}
                        />
                    )}

                    {mode === 'visual' && selected && <DomainPanel group={selected} />}
                </div>
            )}
        </div>
    );
}

export default DnsView;
