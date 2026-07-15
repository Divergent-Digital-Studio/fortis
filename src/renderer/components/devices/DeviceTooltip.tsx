import { Badge, OrbitTooltip } from '../common';
import { useI18n } from '../../i18n';
import type { WifiDevice } from '@shared/types/m1';
import type { NetworkConnection } from '../../types';
import { deviceLabel } from '@shared/utils/device-label';

const CONNECTION_PREVIEW_LIMIT = 4;

interface DeviceTooltipProps {
    device: WifiDevice;
    connections: NetworkConnection[];
    isNew: boolean;
    /** Viewport coordinates of the cursor (or of the node, when focused by keyboard). */
    anchorX: number;
    anchorY: number;
}

function formatTimestamp(value: number): string {
    return new Date(value).toLocaleString();
}

function DeviceTooltip({ device, connections, isNew, anchorX, anchorY }: DeviceTooltipProps) {
    const { t, tn } = useI18n();
    const shown = connections.slice(0, CONNECTION_PREVIEW_LIMIT);
    const hidden = connections.length - shown.length;

    return (
        <OrbitTooltip
            anchorX={anchorX}
            anchorY={anchorY}
            contentKey={`${device.mac}:${connections.length}`}
        >
            <div className="orbit-tooltip__head">
                <span className="orbit-tooltip__name">{deviceLabel(device)}</span>
                {isNew && (
                    <Badge variant="info" size="sm" showIcon={false}>
                        {t('devices.badge.new')}
                    </Badge>
                )}
                {device.isIot && device.iotCategory && (
                    <Badge variant="neutral" size="sm" showIcon={false}>
                        {device.iotCategory}
                    </Badge>
                )}
            </div>

            <dl className="orbit-tooltip__facts">
                <dt>{t('devices.col.type')}</dt>
                <dd>
                    {device.isIot
                        ? (device.iotCategory ?? t('devices.type.iot'))
                        : t('devices.type.device')}
                </dd>
                <dt>{t('devices.col.vendor')}</dt>
                <dd>{device.vendor ?? '—'}</dd>
                <dt>{t('devices.col.ip')}</dt>
                <dd className="orbit-tooltip__mono">{device.ip}</dd>
                <dt>{t('devices.col.mac')}</dt>
                <dd className="orbit-tooltip__mono">{device.mac}</dd>
                <dt>{t('devices.firstSeen')}</dt>
                <dd>{formatTimestamp(device.firstSeen)}</dd>
                <dt>{t('devices.col.lastSeen')}</dt>
                <dd>{formatTimestamp(device.lastSeen)}</dd>
            </dl>

            <div className="orbit-tooltip__section">
                <span className="orbit-tooltip__section-head">
                    {connections.length === 0
                        ? t('devices.tooltip.noConnections')
                        : tn('devices.tooltip.connections', connections.length)}
                </span>
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
                    <span className="orbit-tooltip__more">
                        {t('connections.more', { count: hidden })}
                    </span>
                )}
            </div>
        </OrbitTooltip>
    );
}

export default DeviceTooltip;
