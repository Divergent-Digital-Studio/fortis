import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useAlertStore, SEVERITY_ORDER } from '../stores/alert-store';
import type { AlertSortOrder } from '../stores/alert-store';
import type { Alert, AlertFilters, AlertCounts, ThreatLevel } from '../types';

interface UseAlertsOptions {
    autoFetch?: boolean;
    limit?: number;
}

interface UseAlertsResult {
    alerts: Alert[];
    alertCounts: AlertCounts;
    dismissedIds: Set<string>;
    loading: boolean;
    error: string | null;
    sortOrder: AlertSortOrder;
    filters: AlertFilters;
    fetchAlerts: (filters?: AlertFilters) => Promise<void>;
    fetchRecentAlerts: (limit?: number) => Promise<void>;
    acknowledgeAlert: (id: string) => Promise<boolean>;
    addToWhitelist: (alert: Alert) => Promise<string>;
    dismissAlert: (id: string) => void;
    setFilters: (filters: Partial<AlertFilters>) => void;
    clearFilters: () => void;
    clearFilter: (key: keyof AlertFilters) => void;
    setSort: (order: AlertSortOrder) => void;
    refresh: () => Promise<void>;
}

function useAlerts(options: UseAlertsOptions = {}): UseAlertsResult {
    const { autoFetch = true, limit = 100 } = options;
    const cleanupRef = useRef<(() => void) | null>(null);

    const alerts = useAlertStore((s) => s.alerts);
    const alertCounts = useAlertStore((s) => s.alertCounts);
    const dismissedIds = useAlertStore((s) => s.dismissedIds);
    const loading = useAlertStore((s) => s.loading);
    const error = useAlertStore((s) => s.error);
    const sortOrder = useAlertStore((s) => s.sortOrder);
    const filters = useAlertStore((s) => s.filters);
    const fetchAlertsAction = useAlertStore((s) => s.fetchAlerts);
    const fetchRecentAlertsAction = useAlertStore((s) => s.fetchRecentAlerts);
    const fetchAlertCounts = useAlertStore((s) => s.fetchAlertCounts);
    const acknowledgeAlertAction = useAlertStore((s) => s.acknowledgeAlert);
    const addToWhitelistAction = useAlertStore((s) => s.addToWhitelist);
    const dismissAlertAction = useAlertStore((s) => s.dismissAlert);
    const setFiltersAction = useAlertStore((s) => s.setFilters);
    const clearFiltersAction = useAlertStore((s) => s.clearFilters);
    const clearFilterAction = useAlertStore((s) => s.clearFilter);
    const setSortAction = useAlertStore((s) => s.setSort);
    const initSubscriptions = useAlertStore((s) => s.initSubscriptions);

    useEffect(() => {
        if (autoFetch) {
            fetchRecentAlertsAction(limit);
            fetchAlertCounts();
        }

        const unsubscribe = initSubscriptions();
        cleanupRef.current = unsubscribe;

        return () => {
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }
        };
    }, [autoFetch, limit, fetchRecentAlertsAction, fetchAlertCounts, initSubscriptions]);

    const sortedAlerts = useMemo(() => {
        const filtered = alerts.filter((alert) => {
            if (filters.threatLevel && alert.threatLevel !== filters.threatLevel) return false;
            if (filters.type && alert.type !== filters.type) return false;
            if (filters.acknowledged !== undefined && alert.acknowledged !== filters.acknowledged) return false;
            if (filters.dateFrom && alert.timestamp < filters.dateFrom) return false;
            if (filters.dateTo && alert.timestamp > filters.dateTo) return false;
            return true;
        });

        const sorted = [...filtered];
        switch (sortOrder) {
            case 'newest':
                sorted.sort((a, b) => b.timestamp - a.timestamp);
                break;
            case 'oldest':
                sorted.sort((a, b) => a.timestamp - b.timestamp);
                break;
            case 'severity':
                sorted.sort((a, b) => {
                    const diff = (SEVERITY_ORDER[b.threatLevel as ThreatLevel] ?? 0)
                        - (SEVERITY_ORDER[a.threatLevel as ThreatLevel] ?? 0);
                    return diff !== 0 ? diff : b.timestamp - a.timestamp;
                });
                break;
        }

        return sorted;
    }, [alerts, filters, sortOrder]);

    const refresh = useCallback(async () => {
        await Promise.all([
            fetchRecentAlertsAction(limit),
            fetchAlertCounts(),
        ]);
    }, [fetchRecentAlertsAction, fetchAlertCounts, limit]);

    return {
        alerts: sortedAlerts,
        alertCounts,
        dismissedIds,
        loading,
        error,
        sortOrder,
        filters,
        fetchAlerts: fetchAlertsAction,
        fetchRecentAlerts: fetchRecentAlertsAction,
        acknowledgeAlert: acknowledgeAlertAction,
        addToWhitelist: addToWhitelistAction,
        dismissAlert: dismissAlertAction,
        setFilters: setFiltersAction,
        clearFilters: clearFiltersAction,
        clearFilter: clearFilterAction,
        setSort: setSortAction,
        refresh,
    };
}

export default useAlerts;
export type { UseAlertsResult, UseAlertsOptions };
