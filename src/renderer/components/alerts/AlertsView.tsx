import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ShieldCheck,
    AlertCircle,
    RefreshCw,
    ArrowDownUp,
} from 'lucide-react';
import AlertCard from './AlertCard';
import WhitelistManager from './WhitelistManager';
import { Button, LoadingSkeleton, Select } from '../common';
import type { SelectOption } from '../common';
import useAlerts from '../../hooks/useAlerts';
import { useI18n } from '../../i18n';
import type { AlertSortOrder } from '../../stores/alert-store';
import type { ThreatLevel } from '../../types';
import '../../styles/components/alerts-view.css';

type FilterOption = 'all' | ThreatLevel;

interface FilterConfig {
    key: FilterOption;
    labelKey: string;
    variant?: string;
}

const FILTER_OPTIONS: FilterConfig[] = [
    { key: 'all', labelKey: 'alerts.filter.all' },
    { key: 'critical', labelKey: 'connections.threat.critical', variant: 'critical' },
    { key: 'danger', labelKey: 'connections.threat.danger', variant: 'danger' },
    { key: 'warning', labelKey: 'connections.threat.warning', variant: 'warning' },
    { key: 'info', labelKey: 'connections.threat.info', variant: 'info' },
];

const TICK_INTERVAL_MS = 15_000;

function AlertsView() {
    const { t, tn } = useI18n();
    const {
        alerts,
        alertCounts,
        dismissedIds,
        loading,
        error,
        sortOrder,
        acknowledgeAlert,
        addToWhitelist,
        dismissAlert,
        setFilters,
        clearFilter,
        fetchAlerts,
        fetchRecentAlerts,
        setSort,
        refresh,
    } = useAlerts({ autoFetch: true, limit: 200 });

    const [activeFilter, setActiveFilter] = useState<FilterOption>('all');
    const [showAcknowledged, setShowAcknowledged] = useState(true);
    const [now, setNow] = useState(() => Date.now());

    const sortOptions = useMemo<ReadonlyArray<SelectOption<AlertSortOrder>>>(
        () => [
            { value: 'newest', label: t('alerts.sort.newest') },
            { value: 'oldest', label: t('alerts.sort.oldest') },
            { value: 'severity', label: t('alerts.sort.severity') },
        ],
        [t],
    );

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
        return () => window.clearInterval(id);
    }, []);

    const handleFilterClick = useCallback(
        async (filter: FilterOption) => {
            setActiveFilter(filter);
            if (filter === 'all') {
                clearFilter('threatLevel');
                if (showAcknowledged) {
                    await fetchRecentAlerts(200);
                } else {
                    setFilters({ acknowledged: false });
                    await fetchAlerts({ acknowledged: false });
                }
            } else {
                const newFilters: { threatLevel: ThreatLevel; acknowledged?: false } = {
                    threatLevel: filter as ThreatLevel,
                };
                if (!showAcknowledged) newFilters.acknowledged = false;
                setFilters(newFilters);
                await fetchAlerts(newFilters);
            }
        },
        [setFilters, clearFilter, fetchAlerts, fetchRecentAlerts, showAcknowledged],
    );

    const handleAckToggle = useCallback(async () => {
        const next = !showAcknowledged;
        setShowAcknowledged(next);
        if (!next) {
            setFilters({ acknowledged: false });
            const newFilters: { acknowledged: false; threatLevel?: ThreatLevel } = { acknowledged: false };
            if (activeFilter !== 'all') newFilters.threatLevel = activeFilter as ThreatLevel;
            await fetchAlerts(newFilters);
        } else {
            clearFilter('acknowledged');
            if (activeFilter !== 'all') {
                const newFilters = { threatLevel: activeFilter as ThreatLevel };
                setFilters(newFilters);
                await fetchAlerts(newFilters);
            } else {
                await fetchRecentAlerts(200);
            }
        }
    }, [showAcknowledged, setFilters, clearFilter, fetchAlerts, fetchRecentAlerts, activeFilter]);

    const handleSortChange = useCallback(
        (next: AlertSortOrder) => {
            setSort(next);
        },
        [setSort],
    );

    const handleDismiss = useCallback((id: string) => {
        dismissAlert(id);
    }, [dismissAlert]);

    const handleRetry = useCallback(() => {
        refresh();
    }, [refresh]);

    const visibleAlerts = useMemo(
        () => alerts.filter((a) => !dismissedIds.has(a.id)),
        [alerts, dismissedIds],
    );

    const filterCounts: Record<FilterOption, number> = useMemo(() => ({
        all: alertCounts.total,
        critical: alertCounts.critical,
        danger: alertCounts.danger,
        warning: alertCounts.warning,
        info: alertCounts.info,
        safe: 0,
    }), [alertCounts]);

    if (error && alerts.length === 0) {
        return (
            <div className="alerts-view">
                <div className="alerts-view__error">
                    <AlertCircle
                        size={24}
                        strokeWidth={1.5}
                        className="alerts-view__error-icon"
                    />
                    <h3 className="alerts-view__error-title">
                        {t('alerts.error.title')}
                    </h3>
                    <p className="alerts-view__error-message">{error}</p>
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
        <div className="alerts-view">
            <div className="alerts-view__toolbar">
                <div className="alerts-view__filters">
                    {FILTER_OPTIONS.map((opt) => {
                        const isActive = activeFilter === opt.key;
                        const count = filterCounts[opt.key];
                        const classes = [
                            'alerts-view__filter-btn',
                            opt.variant && `alerts-view__filter-btn--${opt.variant}`,
                            isActive && 'alerts-view__filter-btn--active',
                        ]
                            .filter(Boolean)
                            .join(' ');

                        return (
                            <button
                                key={opt.key}
                                className={classes}
                                onClick={() => handleFilterClick(opt.key)}
                                aria-pressed={isActive}
                            >
                                {t(opt.labelKey)}
                                {count > 0 && (
                                    <span className="alerts-view__filter-count">
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}

                    <div className="alerts-view__ack-toggle">
                        <button
                            className={`alerts-view__ack-btn${!showAcknowledged ? ' alerts-view__ack-btn--active' : ''}`}
                            onClick={handleAckToggle}
                            aria-pressed={!showAcknowledged}
                        >
                            {t('alerts.unresolvedOnly')}
                        </button>
                    </div>
                </div>

                <div className="alerts-view__sort">
                    <ArrowDownUp size={13} strokeWidth={1.5} color="var(--ink-tertiary)" />
                    <span id="alert-sort-label" className="alerts-view__sort-label">
                        {t('alerts.sort.label')}
                    </span>
                    <Select
                        className="alerts-view__sort-select"
                        value={sortOrder}
                        options={sortOptions}
                        onChange={handleSortChange}
                        ariaLabelledBy="alert-sort-label"
                    />
                </div>
            </div>

            {error && (
                <div className="alerts-view__banner" role="alert">
                    <AlertCircle size={14} strokeWidth={1.5} />
                    <span className="alerts-view__banner-message">{error}</span>
                    <Button variant="ghost" size="sm" icon={RefreshCw} onClick={handleRetry}>
                        {t('common.retry')}
                    </Button>
                </div>
            )}

            <div className="alerts-view__summary">
                <span>
                    {tn('alerts.count', visibleAlerts.length)}
                    {activeFilter !== 'all' ? ` (${t(`connections.threat.${activeFilter}`)})` : ''}
                </span>
                {alertCounts.unacknowledged > 0 && (
                    <span>
                        {t('alerts.unresolvedCount', { count: alertCounts.unacknowledged })}
                    </span>
                )}
            </div>

            {loading && alerts.length === 0 ? (
                <div className="alerts-view__loading">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <LoadingSkeleton key={i} height={110} shape="rounded" />
                    ))}
                </div>
            ) : visibleAlerts.length === 0 ? (
                <div className="alerts-view__empty">
                    <div className="alerts-view__empty-icon">
                        <ShieldCheck size={28} strokeWidth={1.5} />
                    </div>
                    <h3 className="alerts-view__empty-title">{t('alerts.empty.title')}</h3>
                    <p className="alerts-view__empty-message">
                        {t('alerts.empty.message')}
                    </p>
                </div>
            ) : (
                <div className="alerts-view__list scrollbar-overlay">
                    {visibleAlerts.map((alert) => (
                        <AlertCard
                            key={alert.id}
                            alert={alert}
                            now={now}
                            onAcknowledge={acknowledgeAlert}
                            onWhitelist={addToWhitelist}
                            onDismiss={handleDismiss}
                        />
                    ))}
                </div>
            )}

            <WhitelistManager />
        </div>
    );
}

export default AlertsView;
