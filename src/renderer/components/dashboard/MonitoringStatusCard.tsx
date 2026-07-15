import { memo, useMemo } from 'react';
import { Activity } from 'lucide-react';
import Card from '../common/Card';
import useScanControl from '../../hooks/useScanControl';
import useConnectionStats from '../../hooks/useConnectionStats';
import { useI18n } from '../../i18n';
import '../../styles/components/overview.css';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function formatLastScan(timestamp: number | null, t: Translate): string {
    if (!timestamp || timestamp <= 0) return t('overview.monitoring.never');

    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);

    if (seconds < 5) return t('common.timeAgo.justNow');
    if (seconds < 60) return t('common.timeAgo.seconds', { count: seconds });

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t('common.timeAgo.minutes', { count: minutes });

    const hours = Math.floor(minutes / 60);
    return t('common.timeAgo.hours', { count: hours });
}

const MonitoringStatusCard = memo(function MonitoringStatusCard() {
    const { t } = useI18n();
    const { monitoringStatus } = useScanControl();
    const { stats } = useConnectionStats();

    const isActive = monitoringStatus
        ? monitoringStatus.isRunning && !monitoringStatus.isPaused
        : false;

    const isPaused = monitoringStatus?.isPaused ?? false;

    const statusLabel = isPaused
        ? t('overview.monitoring.paused')
        : isActive
            ? t('overview.monitoring.active')
            : t('overview.monitoring.inactive');

    const lastScanLabel = useMemo(
        () => formatLastScan(monitoringStatus?.lastScanTimestamp ?? null, t),
        [monitoringStatus?.lastScanTimestamp, t],
    );

    const dotModifier = isPaused
        ? 'monitoring-status__dot--paused'
        : !isActive
            ? 'monitoring-status__dot--inactive'
            : '';

    const dotClasses = [
        'monitoring-status__dot',
        dotModifier,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <Card
            header={t('overview.monitoring.title')}
            headerActions={<Activity size={16} strokeWidth={1.5} />}
        >
            <div className="monitoring-status">
                <div className="monitoring-status__indicator">
                    <span className={dotClasses} />
                    <span className="monitoring-status__text">
                        {statusLabel}
                    </span>
                </div>

                <div className="monitoring-status__meta">
                    <div className="monitoring-status__stat">
                        <span className="monitoring-status__stat-value">
                            {monitoringStatus?.connectionCount ?? stats.totalActive}
                        </span>
                        <span className="monitoring-status__stat-label">
                            {t('overview.monitoring.connections')}
                        </span>
                    </div>
                    <div className="monitoring-status__stat">
                        <span className="monitoring-status__stat-value">
                            {lastScanLabel}
                        </span>
                        <span className="monitoring-status__stat-label">
                            {t('overview.monitoring.lastScan')}
                        </span>
                    </div>
                </div>
            </div>
        </Card>
    );
});

export default MonitoringStatusCard;
