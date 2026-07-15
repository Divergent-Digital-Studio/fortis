import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ChevronDown,
    ChevronUp,
    Trash2,
    Upload,
    Download,
    Shield,
} from 'lucide-react';
import { SearchInput, Badge } from '../common';
import { useI18n } from '../../i18n';
import type { WhitelistEntry, WhitelistSource } from '../../types';
import '../../styles/components/whitelist-manager.css';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const SOURCE_LABEL_KEYS: Record<WhitelistSource, string> = {
    user: 'alerts.whitelist.source.user',
    system: 'alerts.whitelist.source.system',
    learning: 'alerts.whitelist.source.learning',
};

const SOURCE_VARIANTS: Record<WhitelistSource, 'info' | 'neutral' | 'safe'> = {
    user: 'info',
    system: 'neutral',
    learning: 'safe',
};

function formatDate(timestamp: number, t: Translate, locale: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return t('alerts.whitelist.today');
    if (days === 1) return t('alerts.whitelist.yesterday');
    if (days < 7) return t('common.timeAgo.days', { count: days });

    return date.toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
}

function WhitelistManager() {
    const { t, locale } = useI18n();
    const [expanded, setExpanded] = useState(false);
    const [entries, setEntries] = useState<WhitelistEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [importStatus, setImportStatus] = useState<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);
    const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const STATUS_DISMISS_MS = 4000;

    const showStatus = useCallback(
        (status: { type: 'success' | 'error'; message: string }) => {
            if (statusTimerRef.current) {
                clearTimeout(statusTimerRef.current);
            }
            setImportStatus(status);
            statusTimerRef.current = setTimeout(() => {
                setImportStatus(null);
                statusTimerRef.current = null;
            }, STATUS_DISMISS_MS);
        },
        [],
    );

    useEffect(() => {
        return () => {
            if (statusTimerRef.current) {
                clearTimeout(statusTimerRef.current);
                statusTimerRef.current = null;
            }
        };
    }, []);

    const fetchEntries = useCallback(async () => {
        try {
            setLoading(true);
            const data = await window.fortis.getWhitelist();
            setEntries(data);
        } catch {
            setEntries([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!expanded) return;
        fetchEntries();
    }, [expanded, fetchEntries]);

    useEffect(() => {
        const unsub = window.fortis.onWhitelistUpdate((updated) => {
            setEntries(updated);
        });
        return unsub;
    }, []);

    const handleToggle = useCallback(() => {
        setExpanded((prev) => !prev);
    }, []);

    const handleRemove = useCallback(async (id: string) => {
        setRemovingId(id);
        try {
            const success = await window.fortis.removeFromWhitelist(id);
            if (success) {
                setEntries((prev) => prev.filter((e) => e.id !== id));
            }
        } finally {
            setRemovingId(null);
        }
    }, []);

    const handleExport = useCallback(async () => {
        try {
            const data = await window.fortis.exportWhitelist();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `fortis-whitelist-${Date.now()}.json`;
            link.click();
            URL.revokeObjectURL(url);
        } catch {
            showStatus({
                type: 'error',
                message: t('alerts.whitelist.exportFailed'),
            });
        }
    }, [showStatus, t]);

    const handleImport = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const parsed = JSON.parse(text);

                if (!Array.isArray(parsed)) {
                    showStatus({
                        type: 'error',
                        message: t('alerts.whitelist.invalidFormat'),
                    });
                    return;
                }

                const result = await window.fortis.importWhitelist(parsed);
                showStatus({
                    type: 'success',
                    message: t('alerts.whitelist.imported', {
                        imported: result.imported,
                        skipped: result.skipped,
                    }),
                });
                fetchEntries();
            } catch {
                showStatus({
                    type: 'error',
                    message: t('alerts.whitelist.importFailed'),
                });
            }
        };
        input.click();
    }, [fetchEntries, showStatus, t]);

    const filteredEntries = useMemo(() => {
        if (!search.trim()) return entries;
        const query = search.toLowerCase();
        return entries.filter(
            (e) =>
                e.processName?.toLowerCase().includes(query) ||
                e.remoteAddress?.toLowerCase().includes(query) ||
                e.reason.toLowerCase().includes(query),
        );
    }, [entries, search]);

    const handleSearchChange = useCallback((value: string) => {
        setSearch(value);
    }, []);

    return (
        <section className="wl-manager" aria-label={t('alerts.whitelist.title')}>
            <button
                className="wl-manager__header"
                onClick={handleToggle}
                aria-expanded={expanded}
            >
                <div className="wl-manager__header-left">
                    <Shield size={14} strokeWidth={1.5} />
                    <span className="wl-manager__header-title">
                        {t('alerts.whitelist.title')}
                    </span>
                    {entries.length > 0 && (
                        <span className="wl-manager__entry-count">
                            {entries.length}
                        </span>
                    )}
                </div>
                {expanded ? (
                    <ChevronUp size={14} strokeWidth={1.5} />
                ) : (
                    <ChevronDown size={14} strokeWidth={1.5} />
                )}
            </button>

            {expanded && (
                <div className="wl-manager__body">
                    <div className="wl-manager__toolbar">
                        <SearchInput
                            value={search}
                            onChange={handleSearchChange}
                            placeholder={t('alerts.whitelist.searchPlaceholder')}
                            compact
                        />
                        <div className="wl-manager__toolbar-actions">
                            <button
                                className="wl-manager__action-btn"
                                onClick={handleImport}
                                title={t('alerts.whitelist.importTitle')}
                            >
                                <Upload size={13} strokeWidth={1.5} />
                                {t('alerts.whitelist.import')}
                            </button>
                            <button
                                className="wl-manager__action-btn"
                                onClick={handleExport}
                                title={t('alerts.whitelist.exportTitle')}
                            >
                                <Download size={13} strokeWidth={1.5} />
                                {t('alerts.whitelist.export')}
                            </button>
                        </div>
                    </div>

                    {importStatus && (
                        <div
                            className={`wl-manager__status wl-manager__status--${importStatus.type}`}
                        >
                            {importStatus.message}
                        </div>
                    )}

                    {loading ? (
                        <div className="wl-manager__loading">
                            {t('alerts.whitelist.loading')}
                        </div>
                    ) : filteredEntries.length === 0 ? (
                        <div className="wl-manager__empty">
                            {search
                                ? t('alerts.whitelist.noMatch')
                                : t('alerts.whitelist.empty')}
                        </div>
                    ) : (
                        <div className="wl-manager__list scrollbar-overlay">
                            {filteredEntries.map((entry) => (
                                <div
                                    key={entry.id}
                                    className={`wl-manager__entry${removingId === entry.id ? ' wl-manager__entry--removing' : ''}`}
                                >
                                    <div className="wl-manager__entry-info">
                                        <div className="wl-manager__entry-primary">
                                            {entry.processName && (
                                                <span className="wl-manager__entry-process">
                                                    {entry.processName}
                                                </span>
                                            )}
                                            {entry.remoteAddress && (
                                                <span className="wl-manager__entry-address">
                                                    {entry.remoteAddress}
                                                    {entry.remotePort
                                                        ? `:${entry.remotePort}`
                                                        : ''}
                                                </span>
                                            )}
                                        </div>
                                        <div className="wl-manager__entry-secondary">
                                            <span className="wl-manager__entry-reason">
                                                {entry.reason}
                                            </span>
                                            <span className="wl-manager__entry-meta">
                                                <Badge
                                                    variant={
                                                        SOURCE_VARIANTS[
                                                        entry.source
                                                        ]
                                                    }
                                                    size="sm"
                                                    showIcon={false}
                                                >
                                                    {t(SOURCE_LABEL_KEYS[entry.source])}
                                                </Badge>
                                                <span className="wl-manager__entry-date">
                                                    {formatDate(
                                                        entry.createdAt,
                                                        t,
                                                        locale,
                                                    )}
                                                </span>
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        className="wl-manager__remove-btn"
                                        onClick={() => handleRemove(entry.id)}
                                        disabled={removingId === entry.id}
                                        title={t('alerts.whitelist.removeTitle')}
                                        aria-label={t('alerts.whitelist.removeAria', {
                                            name:
                                                entry.processName ??
                                                entry.remoteAddress ??
                                                t('alerts.whitelist.entryFallback'),
                                        })}
                                    >
                                        <Trash2 size={13} strokeWidth={1.5} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

export default WhitelistManager;
