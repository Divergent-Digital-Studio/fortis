import { memo, useCallback, useState } from 'react';
import {
    ShieldX,
    ShieldAlert,
    AlertTriangle,
    Info,
    ShieldCheck,
    CheckCircle2,
    ListPlus,
    X,
    Layers,
    Monitor,
    Globe,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { Alert, ThreatLevel } from '../../types';

interface AlertCardProps {
    alert: Alert;
    now: number;
    onAcknowledge: (id: string) => Promise<boolean>;
    onWhitelist: (alert: Alert) => Promise<string>;
    onDismiss: (id: string) => void;
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const THREAT_ICONS: Record<ThreatLevel, LucideIcon> = {
    critical: ShieldX,
    danger: ShieldAlert,
    warning: AlertTriangle,
    info: Info,
    safe: ShieldCheck,
};

function formatTimeAgo(timestamp: number, now: number, t: Translate): string {
    const diff = Math.max(0, now - timestamp);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return t('common.timeAgo.days', { count: days });
    if (hours > 0) return t('common.timeAgo.hours', { count: hours });
    if (minutes > 0) return t('common.timeAgo.minutes', { count: minutes });
    if (seconds > 5) return t('common.timeAgo.seconds', { count: seconds });
    return t('common.timeAgo.justNow');
}

const AlertCard = memo(function AlertCard({
    alert,
    now,
    onAcknowledge,
    onWhitelist,
    onDismiss,
}: AlertCardProps) {
    const { t, tn } = useI18n();
    const level = alert.threatLevel as ThreatLevel;
    const Icon = THREAT_ICONS[level] ?? Info;
    const [busy, setBusy] = useState(false);

    const handleAcknowledge = useCallback(async () => {
        setBusy(true);
        try {
            await onAcknowledge(alert.id);
        } finally {
            setBusy(false);
        }
    }, [alert.id, onAcknowledge]);

    const handleWhitelist = useCallback(async () => {
        setBusy(true);
        try {
            await onWhitelist(alert);
        } finally {
            setBusy(false);
        }
    }, [alert, onWhitelist]);

    const handleDismiss = useCallback(() => {
        onDismiss(alert.id);
    }, [alert.id, onDismiss]);

    const cardClasses = [
        'alert-card',
        `alert-card--${level}`,
        alert.acknowledged && 'alert-card--acknowledged',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div
            className={cardClasses}
            role="article"
            aria-label={t('alerts.card.aria', {
                level: t(`connections.threat.${level}`),
                title: alert.title,
            })}
        >
            <div className={`alert-card__icon alert-card__icon--${level}`}>
                <Icon size={16} strokeWidth={2} />
            </div>

            <div className="alert-card__content">
                <div className="alert-card__header">
                    <h4 className="alert-card__title">{alert.title}</h4>
                    <time
                        className="alert-card__timestamp"
                        dateTime={new Date(alert.timestamp).toISOString()}
                        title={new Date(alert.timestamp).toLocaleString()}
                    >
                        {formatTimeAgo(alert.timestamp, now, t)}
                    </time>
                </div>

                <p className="alert-card__description">{alert.description}</p>

                {alert.recommendation && (
                    <p className="alert-card__recommendation">
                        {alert.recommendation}
                    </p>
                )}

                <div className="alert-card__meta">
                    {alert.processName && (
                        <span className="alert-card__meta-item">
                            <Monitor size={11} strokeWidth={1.5} />
                            <span className="alert-card__meta-value">{alert.processName}</span>
                        </span>
                    )}
                    {alert.remoteAddress && (
                        <span className="alert-card__meta-item">
                            <Globe size={11} strokeWidth={1.5} />
                            <span className="alert-card__meta-value">
                                {alert.remoteAddress}
                                {alert.remotePort ? `:${alert.remotePort}` : ''}
                            </span>
                        </span>
                    )}
                    {alert.suppressedCount > 0 && (
                        <span className="alert-card__suppressed">
                            <Layers size={10} strokeWidth={1.5} />
                            {tn('alerts.card.suppressed', alert.suppressedCount)}
                        </span>
                    )}
                </div>

                <div className="alert-card__actions">
                    <button
                        className="alert-card__action-btn alert-card__action-btn--ack"
                        onClick={handleAcknowledge}
                        disabled={alert.acknowledged || busy}
                        title={
                            alert.acknowledged
                                ? t('alerts.card.acknowledgedTitle')
                                : t('alerts.card.acknowledgeTitle')
                        }
                    >
                        <CheckCircle2 size={12} strokeWidth={1.5} />
                        {alert.acknowledged
                            ? t('alerts.card.acknowledged')
                            : t('alerts.card.acknowledge')}
                    </button>
                    <button
                        className="alert-card__action-btn alert-card__action-btn--whitelist"
                        onClick={handleWhitelist}
                        disabled={alert.whitelisted || busy}
                        title={
                            alert.whitelisted
                                ? t('alerts.card.whitelistedTitle')
                                : t('alerts.card.whitelistTitle')
                        }
                    >
                        <ListPlus size={12} strokeWidth={1.5} />
                        {alert.whitelisted
                            ? t('alerts.card.whitelisted')
                            : t('alerts.card.whitelist')}
                    </button>
                    <button
                        className="alert-card__action-btn alert-card__action-btn--dismiss"
                        onClick={handleDismiss}
                        title={t('alerts.card.dismissTitle')}
                    >
                        <X size={12} strokeWidth={1.5} />
                        {t('common.dismiss')}
                    </button>
                </div>
            </div>
        </div>
    );
});

export default AlertCard;
export type { AlertCardProps };
