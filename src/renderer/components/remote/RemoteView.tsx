import { useEffect, useMemo, useState } from 'react';
import { Radio, ServerCog, CircleDot, ShieldAlert, AlertCircle, X } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import DataTable, { type Column } from '../common/DataTable';
import EmptyState from '../common/EmptyState';
import useRemote from '../../hooks/useRemote';
import { useI18n } from '../../i18n';
import type { RemoteAgentInfo, RemoteAgentStatus } from '@shared/types/m5';
import '../../styles/components/settings.css';
import '../../styles/components/remote-view.css';

function statusVariant(status: RemoteAgentStatus): 'safe' | 'warning' | 'neutral' {
    if (status === 'connected') return 'safe';
    if (status === 'stale') return 'warning';
    return 'neutral';
}

function relativeTime(ts: number, now: number, t: (key: string, vars?: Record<string, string | number>) => string): string {
    const sec = Math.max(0, Math.round((now - ts) / 1000));
    if (sec < 60) return t('remote.time.secondsAgo', { count: sec });
    const min = Math.round(sec / 60);
    if (min < 60) return t('remote.time.minutesAgo', { count: min });
    const hr = Math.round(min / 60);
    return t('remote.time.hoursAgo', { count: hr });
}

function useNow(intervalMs: number): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}

function RemoteView() {
    const { t } = useI18n();
    const { serverState, agents, events, lanAddress, error, dismissError } = useRemote();
    const now = useNow(1000);

    const connectHost = serverState.host === '0.0.0.0' ? lanAddress || '<this-host>' : serverState.host;
    const reachableOnlyLocally = serverState.host === '127.0.0.1';

    const columns = useMemo<ReadonlyArray<Column<RemoteAgentInfo>>>(
        () => [
            { key: 'agentId', header: t('remote.col.agent'), sortValue: (a) => a.agentId, mono: true, width: '2fr' },
            { key: 'platform', header: t('remote.col.platform'), sortValue: (a) => a.platform },
            {
                key: 'status',
                header: t('remote.col.status'),
                sortValue: (a) => a.status,
                render: (a) => <Badge variant={statusVariant(a.status)}>{t(`remote.status.${a.status}`)}</Badge>,
            },
            {
                key: 'lastSeen',
                header: t('remote.col.lastSeen'),
                sortValue: (a) => a.lastSeen,
                render: (a) => relativeTime(a.lastSeen, now, t),
            },
        ],
        [now, t],
    );

    return (
        <div className="remote-view">
            {error && (
                <div className="remote-status__error" role="alert">
                    <AlertCircle size={14} strokeWidth={1.5} />
                    <span>{t('remote.error.loadFailed', { message: error })}</span>
                    <Button variant="ghost" size="sm" icon={X} onClick={dismissError} aria-label={t('common.dismiss')}>
                        {t('common.dismiss')}
                    </Button>
                </div>
            )}
            <Card
                header={
                    <div className="settings-section__header">
                        <ServerCog size={18} strokeWidth={1.5} className="settings-section__icon" />
                        <span className="settings-section__title">{t('remote.serverTitle')}</span>
                    </div>
                }
            >
                <div className="remote-status">
                    <div className="remote-status__item">
                        <span className="remote-status__label">{t('remote.label.status')}</span>
                        <Badge variant={serverState.listening ? 'safe' : 'neutral'}>
                            {serverState.enabled
                                ? serverState.listening
                                    ? t('remote.state.listening')
                                    : t('remote.state.stopped')
                                : t('common.disabled')}
                        </Badge>
                    </div>
                    <div className="remote-status__item">
                        <span className="remote-status__label">{t('remote.label.address')}</span>
                        <span className="remote-status__value">
                            {serverState.host}:{serverState.port}
                        </span>
                    </div>
                    <div className="remote-status__item">
                        <span className="remote-status__label">{t('remote.label.connectedAgents')}</span>
                        <span className="remote-status__value">{serverState.agentCount}</span>
                    </div>
                    <div className="remote-status__item">
                        <span className="remote-status__label">{t('remote.label.connectTo')}</span>
                        <span className="remote-status__value remote-status__value--mono">
                            ws://{connectHost}:{serverState.port}
                        </span>
                    </div>
                </div>
                {serverState.error && (
                    <p className="remote-status__error" role="alert">
                        {serverState.error}
                    </p>
                )}
                {serverState.enabled && reachableOnlyLocally && (
                    <p className="remote-status__hint">
                        {t('remote.loopbackHint')}
                    </p>
                )}
            </Card>

            <Card
                header={
                    <div className="settings-section__header">
                        <Radio size={18} strokeWidth={1.5} className="settings-section__icon" />
                        <span className="settings-section__title">{t('remote.agentsTitle')}</span>
                    </div>
                }
            >
                <DataTable
                    rows={agents}
                    columns={columns}
                    rowKey={(a) => a.agentId}
                    label={t('remote.tableAria')}
                    emptyMessage={
                        serverState.listening
                            ? t('remote.emptyListening', { host: connectHost, port: serverState.port })
                            : t('remote.emptyStopped')
                    }
                />
            </Card>

            <Card
                header={
                    <div className="settings-section__header">
                        <CircleDot size={18} strokeWidth={1.5} className="settings-section__icon" />
                        <span className="settings-section__title">{t('remote.eventsTitle')}</span>
                    </div>
                }
            >
                {events.length === 0 ? (
                    <EmptyState
                        icon={CircleDot}
                        title={t('remote.events.emptyTitle')}
                        message={t('remote.events.emptyMessage')}
                    />
                ) : (
                    <ul className="remote-events scrollbar-overlay">
                        {events.map((e) => (
                            <li key={`${e.agentId}-${e.ts}-${e.kind}-${e.summary}`} className="remote-events__item">
                                <span className="remote-events__time">{relativeTime(e.ts, now, t)}</span>
                                {e.kind === 'alert' ? (
                                    <ShieldAlert size={14} strokeWidth={1.5} className="remote-events__icon" />
                                ) : (
                                    <CircleDot size={14} strokeWidth={1.5} className="remote-events__icon" />
                                )}
                                <span className="remote-events__agent">{e.agentId}</span>
                                <span className="remote-events__summary" title={e.summary}>
                                    {e.summary}
                                </span>
                                {e.threatLevel && (
                                    <Badge variant="warning">{t(`connections.threat.${e.threatLevel}`)}</Badge>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    );
}

export default RemoteView;
