import { Globe, X } from 'lucide-react';
import { Badge } from '../common';
import { useI18n } from '../../i18n';
import type { NetworkConnection } from '../../types';

interface ConnectionDetailProps {
    address: string;
    connections: NetworkConnection[];
    onClose: () => void;
}

function ConnectionDetail({ address, connections, onClose }: ConnectionDetailProps) {
    const { t } = useI18n();
    const processes = new Set(connections.map((connection) => connection.processName));

    return (
        <aside className="page-panel scrollbar-overlay" aria-label={t('connections.panel.detailsAria')}>
            <header className="connections-view__panel-head">
                <Globe size={18} strokeWidth={1.5} />
                <h3 className="connections-view__panel-address">{address}</h3>
                <button
                    type="button"
                    className="connections-view__panel-close"
                    onClick={onClose}
                    aria-label={t('connections.panel.closeAria')}
                >
                    <X size={16} strokeWidth={1.5} />
                </button>
            </header>

            <dl className="connections-view__facts">
                <dt>{t('connections.panel.connections')}</dt>
                <dd>{connections.length}</dd>
                <dt>{t('connections.panel.processes')}</dt>
                <dd>{processes.size}</dd>
            </dl>

            <section className="connections-view__sockets">
                <h4>{t('connections.panel.sockets')}</h4>
                <ul>
                    {connections.map((connection) => (
                        <li key={connection.id}>
                            <span className="connections-view__socket-process">{connection.processName}</span>
                            <Badge variant="neutral" size="sm" showIcon={false}>
                                {connection.state}
                            </Badge>
                            <span className="connections-view__socket-route">
                                {connection.protocol}
                                {' · :'}
                                {connection.localPort}
                                {' → :'}
                                {connection.remotePort}
                            </span>
                        </li>
                    ))}
                </ul>
            </section>
        </aside>
    );
}

export default ConnectionDetail;
export type { ConnectionDetailProps };
