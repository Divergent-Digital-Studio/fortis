import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { toActionError } from './action-error';
import type {
    Alert,
    AlertFilters,
    AlertCounts,
    ThreatLevel,
    AIAnalysisResult,
    WhitelistEntry,
} from '../../shared/types';

type AlertSortOrder = 'newest' | 'oldest' | 'severity';

interface AlertState {
    alerts: Alert[];
    alertCounts: AlertCounts;
    dismissedIds: Set<string>;
    loading: boolean;
    error: string | null;
    filters: AlertFilters;
    sortOrder: AlertSortOrder;
    lastAnalysis: AIAnalysisResult | null;
}

interface AlertActions {
    fetchAlerts: (filters?: AlertFilters) => Promise<void>;
    fetchRecentAlerts: (limit?: number) => Promise<void>;
    fetchAlertCounts: () => Promise<void>;
    acknowledgeAlert: (id: string) => Promise<boolean>;
    addToWhitelist: (alert: Alert) => Promise<string>;
    setFilters: (filters: Partial<AlertFilters>) => void;
    clearFilters: () => void;
    clearFilter: (key: keyof AlertFilters) => void;
    setSort: (order: AlertSortOrder) => void;
    prependAlert: (alert: Alert) => void;
    setLastAnalysis: (result: AIAnalysisResult) => void;
    dismissAlert: (id: string) => void;
    initSubscriptions: () => () => void;
    initAlertSubscriptions: () => () => void;
}

type AlertStore = AlertState & AlertActions;

const INITIAL_COUNTS: AlertCounts = {
    total: 0,
    critical: 0,
    danger: 0,
    warning: 0,
    info: 0,
    unacknowledged: 0,
};

const DEFAULT_FETCH_LIMIT = 200;

const SEVERITY_ORDER: Record<ThreatLevel, number> = {
    critical: 5,
    danger: 4,
    warning: 3,
    info: 2,
    safe: 1,
};

export const useAlertStore = create<AlertStore>()(
    subscribeWithSelector((set, get) => ({
        alerts: [],
        alertCounts: INITIAL_COUNTS,
        dismissedIds: new Set<string>(),
        loading: false,
        error: null,
        filters: {},
        sortOrder: 'newest',
        lastAnalysis: null,

        fetchAlerts: async (filters?: AlertFilters) => {
            try {
                set({ loading: true, error: null });
                const activeFilters = filters ?? get().filters;
                const alerts = await window.fortis.getAlerts({
                    limit: DEFAULT_FETCH_LIMIT,
                    ...activeFilters,
                });
                set({ alerts, loading: false });
                void get().fetchAlertCounts();
            } catch (err) {
                set({ error: toActionError(err, 'Failed to fetch alerts'), loading: false });
            }
        },

        fetchRecentAlerts: async (limit = DEFAULT_FETCH_LIMIT) => {
            try {
                set({ loading: true, error: null });
                const alerts = await window.fortis.getRecentAlerts(limit);
                set({ alerts, loading: false });
            } catch (err) {
                set({ error: toActionError(err, 'Failed to fetch recent alerts'), loading: false });
            }
        },

        fetchAlertCounts: async () => {
            try {
                const alertCounts = await window.fortis.getAlertCounts();
                set({ alertCounts });
            } catch {
                set({ alertCounts: INITIAL_COUNTS });
            }
        },

        acknowledgeAlert: async (id: string) => {
            try {
                const success = await window.fortis.acknowledgeAlert(id);
                if (success) {
                    set((state) => ({
                        error: null,
                        alerts: state.alerts.map((a) =>
                            a.id === id ? { ...a, acknowledged: true } : a,
                        ),
                        alertCounts: {
                            ...state.alertCounts,
                            unacknowledged: Math.max(0, state.alertCounts.unacknowledged - 1),
                        },
                    }));
                    void get().fetchAlertCounts();
                }
                return success;
            } catch (err) {
                set({ error: toActionError(err, 'Failed to acknowledge alert') });
                return false;
            }
        },

        addToWhitelist: async (alert: Alert) => {
            try {
                const entry: Omit<WhitelistEntry, 'id' | 'createdAt'> = {
                    reason: `Whitelisted from alert: ${alert.title}`,
                    source: 'user',
                };
                if (alert.processName !== undefined) entry.processName = alert.processName;
                if (alert.remoteAddress !== undefined) entry.remoteAddress = alert.remoteAddress;
                if (alert.remotePort !== undefined) entry.remotePort = alert.remotePort;
                const entryId = await window.fortis.addToWhitelist(entry);
                set((state) => ({
                    error: null,
                    alerts: state.alerts.map((a) =>
                        a.id === alert.id ? { ...a, whitelisted: true } : a,
                    ),
                }));
                return entryId;
            } catch (err) {
                set({ error: toActionError(err, 'Failed to add to whitelist') });
                return '';
            }
        },

        setFilters: (filters: Partial<AlertFilters>) => {
            set((state) => ({
                filters: { ...state.filters, ...filters },
            }));
        },

        clearFilters: () => {
            set({ filters: {} });
        },

        clearFilter: (key: keyof AlertFilters) => {
            set((state) => {
                const next = { ...state.filters };
                delete next[key];
                return { filters: next };
            });
        },

        setSort: (sortOrder: AlertSortOrder) => {
            set({ sortOrder });
        },

        prependAlert: (alert: Alert) => {
            set((state) => {
                const exists = state.alerts.some((a) => a.id === alert.id);
                if (exists) return state;

                return {
                    alerts: [alert, ...state.alerts],
                    alertCounts: {
                        ...state.alertCounts,
                        total: state.alertCounts.total + 1,
                        unacknowledged: state.alertCounts.unacknowledged + 1,
                        ...(alert.threatLevel === 'critical' && {
                            critical: state.alertCounts.critical + 1,
                        }),
                        ...(alert.threatLevel === 'danger' && {
                            danger: state.alertCounts.danger + 1,
                        }),
                        ...(alert.threatLevel === 'warning' && {
                            warning: state.alertCounts.warning + 1,
                        }),
                        ...(alert.threatLevel === 'info' && {
                            info: state.alertCounts.info + 1,
                        }),
                    },
                };
            });
        },

        setLastAnalysis: (result: AIAnalysisResult) => {
            set({ lastAnalysis: result });
        },

        dismissAlert: (id: string) => {
            set((state) => {
                if (state.dismissedIds.has(id)) return state;
                const next = new Set(state.dismissedIds);
                next.add(id);
                return { dismissedIds: next };
            });
        },

        initSubscriptions: () => {
            const unsubAlert = window.fortis.onNewAlert((alert) => {
                get().prependAlert(alert);
            });

            const unsubAnalysis = window.fortis.onAnalysisUpdate((result) => {
                get().setLastAnalysis(result);
            });

            const unsubWhitelist = window.fortis.onWhitelistUpdate(() => {
                void get().fetchAlerts();
            });

            return () => {
                unsubAlert();
                unsubAnalysis();
                unsubWhitelist();
            };
        },

        initAlertSubscriptions: () => {
            void get().fetchAlertCounts();

            const unsubAlert = window.fortis.onNewAlert((alert) => {
                get().prependAlert(alert);
            });

            const unsubAnalysis = window.fortis.onAnalysisUpdate((result) => {
                get().setLastAnalysis(result);
                void get().fetchAlertCounts();
            });

            return () => {
                unsubAlert();
                unsubAnalysis();
            };
        },
    })),
);

export { SEVERITY_ORDER };
export type { AlertSortOrder, AlertState, AlertActions };
