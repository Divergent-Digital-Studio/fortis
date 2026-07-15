import { memo, useState, useEffect, useCallback } from 'react';
import {
    Bell,
    ShieldAlert,
    ShieldCheck,
    ShieldX,
    AlertTriangle,
    Info,
    ChevronRight,
} from 'lucide-react';
import Card from '../common/Card';
import EmptyState from '../common/EmptyState';
import { useUIStore } from '../../stores';
import { useI18n } from '../../i18n';
import type { Alert, ThreatLevel } from '../../types';
import '../../styles/components/recent-alerts.css';

function getThreatIcon(level: ThreatLevel) {
    switch (level) {
        case 'critical':
            return ShieldX;
        case 'danger':
            return ShieldAlert;
        case 'warning':
            return AlertTriangle;
        case 'info':
            return Info;
        default:
            return ShieldCheck;
    }
}

function getThreatVariant(level: ThreatLevel): string {
    switch (level) {
        case 'critical':
            return 'critical';
        case 'danger':
            return 'danger';
        case 'warning':
            return 'warning';
        case 'info':
            return 'info';
        default:
            return 'safe';
    }
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function formatTimeAgo(timestamp: number, t: Translate): string {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return t('common.timeAgo.hours', { count: hours });
    if (minutes > 0) return t('common.timeAgo.minutes', { count: minutes });
    return t('common.timeAgo.justNow');
}

const RECENT_LIMIT = 20;

const RecentAlertsList = memo(function RecentAlertsList() {
    const { t } = useI18n();
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const setActiveView = useUIStore((state) => state.setActiveView);

    const fetchAlerts = useCallback(async () => {
        try {
            const data = await window.fortis.getAlerts(RECENT_LIMIT);
            setAlerts(data);
        } catch {
            setAlerts([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAlerts();

        const unsubNewAlert = window.fortis.onNewAlert((newAlert) => {
            setAlerts((prev) => [newAlert, ...prev].slice(0, RECENT_LIMIT));
        });

        const unsubAnalysis = window.fortis.onAnalysisUpdate(() => {
            fetchAlerts();
        });

        const interval = setInterval(fetchAlerts, 15000);

        return () => {
            unsubNewAlert();
            unsubAnalysis();
            clearInterval(interval);
        };
    }, [fetchAlerts]);

    const handleViewAll = useCallback(() => {
        setActiveView('alerts');
    }, [setActiveView]);

    const viewAllAction = alerts.length > 0 ? (
        <button
            className="recent-alerts__view-all"
            onClick={handleViewAll}
            type="button"
        >
            {t('overview.recentAlerts.viewAll')} <ChevronRight size={12} strokeWidth={2} />
        </button>
    ) : undefined;

    return (
        <Card
            header={t('overview.recentAlerts.title')}
            headerActions={viewAllAction}
            className="overview__chart-card"
        >
            {isLoading ? (
                <div className="recent-alerts__loading">
                    {t('overview.recentAlerts.loading')}
                </div>
            ) : alerts.length === 0 ? (
                <EmptyState
                    icon={Bell}
                    title={t('overview.recentAlerts.emptyTitle')}
                    message={t('overview.recentAlerts.emptyMessage')}
                />
            ) : (
                <div className="recent-alerts scrollbar-overlay">
                    {alerts.map((alert) => {
                        const Icon = getThreatIcon(alert.threatLevel);
                        const variant = getThreatVariant(alert.threatLevel);

                        return (
                            <div
                                key={alert.id}
                                className="recent-alerts__item"
                            >
                                <div
                                    className={`recent-alerts__icon recent-alerts__icon--${variant}`}
                                >
                                    <Icon size={14} strokeWidth={2} />
                                </div>
                                <div className="recent-alerts__content">
                                    <div className="recent-alerts__title">
                                        {alert.title}
                                    </div>
                                    <div className="recent-alerts__description">
                                        {alert.description}
                                    </div>
                                </div>
                                <div className="recent-alerts__time">
                                    {formatTimeAgo(alert.timestamp, t)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
});

export default RecentAlertsList;
