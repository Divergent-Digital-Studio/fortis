import { OrbitTooltip } from '../common';
import { useI18n } from '../../i18n';
import type { NetworkConnection } from '../../types';

const SOCKET_PREVIEW_LIMIT = 4;

interface ConnectionHoverCardProps {
    address: string;
    connections: NetworkConnection[];
    anchorX: number;
    anchorY: number;
}

function ConnectionHoverCard({ address, connections, anchorX, anchorY }: ConnectionHoverCardProps) {
    const { t } = useI18n();
    const shown = connections.slice(0, SOCKET_PREVIEW_LIMIT);
    const hidden = connections.length - shown.length;
    const processes = new Set(connections.map((connection) => connection.processName));
    const protocols = new Set(connections.map((connection) => connection.protocol));

    return (
        <OrbitTooltip
            anchorX={anchorX}
            anchorY={anchorY}
            contentKey={`${address}:${connections.length}`}
        >
            <div className="orbit-tooltip__head">
                <span className="orbit-tooltip__name orbit-tooltip__mono">{address}</span>
            </div>

            <dl className="orbit-tooltip__facts">
                <dt>{t('connections.panel.connections')}</dt>
                <dd>{connections.length}</dd>
                <dt>{t('connections.panel.processes')}</dt>
                <dd>{processes.size}</dd>
                <dt>{t('connections.panel.protocol')}</dt>
                <dd>{[...protocols].join(', ') || '—'}</dd>
            </dl>

            <div className="orbit-tooltip__section">
                <span className="orbit-tooltip__section-head">{t('connections.panel.sockets')}</span>
                {shown.map((connection) => (
                    <span key={connection.id} className="orbit-tooltip__row">
                        <span className="orbit-tooltip__row-name">{connection.processName}</span>
                        <span className="orbit-tooltip__mono">
                            {connection.protocol}
                            {' :'}
                            {connection.remotePort}
                        </span>
                        <span className="orbit-tooltip__row-meta">{connection.state}</span>
                    </span>
                ))}
                {hidden > 0 && (
                    <span className="orbit-tooltip__more">{t('connections.more', { count: hidden })}</span>
                )}
            </div>
        </OrbitTooltip>
    );
}

export default ConnectionHoverCard;
export type { ConnectionHoverCardProps };
