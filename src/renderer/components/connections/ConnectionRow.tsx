import { memo, useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import {
    ShieldCheck,
    ShieldX,
    ShieldAlert,
    AlertTriangle,
    Info,
    ShieldPlus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { NetworkConnection, ThreatLevel } from '../../types';

interface ThreatData {
    threatLevel: ThreatLevel | null;
    confidence: number | null;
    explanation: string | null;
    source: 'ai' | 'rule' | null;
}

interface ConnectionRowProps {
    connection: NetworkConnection;
    isNew: boolean;
    threatData?: ThreatData | undefined;
    onMarkAsSafe?: ((connection: NetworkConnection) => void) | undefined;
    onSelect?: ((connection: NetworkConnection) => void) | undefined;
    isActive?: boolean | undefined;
}

const STATE_BADGE_CLASS: Record<string, string> = {
    ESTABLISHED: 'connection-row__state-badge--established',
    LISTEN: 'connection-row__state-badge--listen',
    TIME_WAIT: 'connection-row__state-badge--time-wait',
    CLOSE_WAIT: 'connection-row__state-badge--close-wait',
    CLOSING: 'connection-row__state-badge--closing',
    LAST_ACK: 'connection-row__state-badge--last-ack',
    FIN_WAIT1: 'connection-row__state-badge--fin-wait1',
    FIN_WAIT2: 'connection-row__state-badge--fin-wait2',
    SYN_SENT: 'connection-row__state-badge--syn-sent',
    SYN_RECV: 'connection-row__state-badge--syn-recv',
    CLOSED: 'connection-row__state-badge--closed',
};

const THREAT_ICONS: Record<ThreatLevel, LucideIcon> = {
    critical: ShieldX,
    danger: ShieldAlert,
    warning: AlertTriangle,
    info: Info,
    safe: ShieldCheck,
};

const THREAT_COLORS: Record<ThreatLevel, string> = {
    critical: 'var(--status-critical)',
    danger: 'var(--status-danger)',
    warning: 'var(--status-warning)',
    info: 'var(--status-info)',
    safe: 'var(--status-safe)',
};

function formatDuration(timestampMs: number, now: number): string {
    const elapsed = now - timestampMs;
    const seconds = Math.floor(elapsed / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
}

function getProcessColor(processName: string): string {
    let hash = 0;
    for (let i = 0; i < processName.length; i++) {
        hash = processName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 60%, 55%)`;
}

function ConnectionRow({ connection, isNew, threatData, onMarkAsSafe, onSelect, isActive }: ConnectionRowProps) {
    const { t } = useI18n();
    const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [threatTooltip, setThreatTooltip] = useState<{ x: number; y: number } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
    const rowRef = useRef<HTMLDivElement>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);

    const level = threatData?.threatLevel ?? 'safe';
    const ThreatIcon = THREAT_ICONS[level];
    const threatColor = THREAT_COLORS[level];

    useLayoutEffect(() => {
        if (!contextMenu) {
            setMenuPosition(null);
            return;
        }

        const menuEl = contextMenuRef.current;
        const width = menuEl?.offsetWidth ?? 0;
        const height = menuEl?.offsetHeight ?? 0;
        const margin = 8;

        const maxLeft = window.innerWidth - width - margin;
        const maxTop = window.innerHeight - height - margin;
        const left = Math.max(margin, Math.min(contextMenu.x, maxLeft));
        const top = Math.max(margin, Math.min(contextMenu.y, maxTop));

        setMenuPosition({ left, top });
    }, [contextMenu]);

    useEffect(() => {
        if (!tooltip) return;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [tooltip]);

    useEffect(() => {
        if (!contextMenu) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
                setContextMenu(null);
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setContextMenu(null);
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [contextMenu]);

    const handleMouseEnter = useCallback((e: React.MouseEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setTooltip({ x: rect.left + 16, y: rect.top - 8 });
    }, []);

    const handleMouseLeave = useCallback(() => {
        setTooltip(null);
    }, []);

    const handleThreatMouseEnter = useCallback((e: React.MouseEvent) => {
        if (!threatData?.threatLevel) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setThreatTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    }, [threatData?.threatLevel]);

    const handleThreatMouseLeave = useCallback(() => {
        setThreatTooltip(null);
    }, []);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
    }, []);

    const handleMarkAsSafe = useCallback((e: React.MouseEvent) => {
        // The menu lives inside the row; the click must not toggle row selection.
        e.stopPropagation();
        onMarkAsSafe?.(connection);
        setContextMenu(null);
    }, [connection, onMarkAsSafe]);

    const handleClick = useCallback(() => {
        onSelect?.(connection);
    }, [connection, onSelect]);

    const badgeClass = STATE_BADGE_CLASS[connection.state] || '';
    const rowClasses = [
        'connection-row',
        isNew && 'connection-row--new',
        level !== 'safe' && `connection-row--${level}`,
        onSelect && 'connection-row--clickable',
        isActive && 'connection-row--active',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div
            ref={rowRef}
            className={rowClasses}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onContextMenu={handleContextMenu}
            onClick={onSelect ? handleClick : undefined}
        >
            <div className="connection-row__cell connection-row__cell--process">
                <span
                    className="connection-row__process-dot"
                    style={{ background: getProcessColor(connection.processName) }}
                />
                <span>{connection.processName || t('connections.unknownProcess')}</span>
            </div>

            <div className="connection-row__cell connection-row__cell--mono">
                {connection.remoteAddress || '*'}
            </div>

            <div className="connection-row__cell connection-row__cell--mono">
                {connection.remotePort || '*'}
            </div>

            <div className="connection-row__cell">
                {connection.protocol.toUpperCase()}
            </div>

            <div className="connection-row__cell connection-row__cell--state">
                <span className={`connection-row__state-badge ${badgeClass}`}>
                    {connection.state}
                </span>
            </div>

            <div
                className="connection-row__cell connection-row__cell--threat"
                onMouseEnter={handleThreatMouseEnter}
                onMouseLeave={handleThreatMouseLeave}
            >
                <ThreatIcon size={14} strokeWidth={1.5} color={threatColor} />
            </div>

            {tooltip && (
                <div
                    className="connection-row__tooltip"
                    style={{ left: tooltip.x, top: tooltip.y, transform: 'translateY(-100%)' }}
                >
                    <div className="connection-row__tooltip-path">
                        PID {connection.processId} &middot; {connection.localAddress}:{connection.localPort} → {connection.remoteAddress}:{connection.remotePort}
                    </div>
                    <div className="connection-row__tooltip-duration">
                        {t('connections.connectedFor', { duration: formatDuration(connection.timestamp, now) })}
                    </div>
                </div>
            )}

            {threatTooltip && threatData?.threatLevel && (
                <div
                    className="connection-row__threat-tooltip"
                    style={{ left: threatTooltip.x, top: threatTooltip.y, transform: 'translate(-50%, -100%)' }}
                >
                    <div className="connection-row__threat-tooltip-header">
                        <ThreatIcon size={12} strokeWidth={2} color={threatColor} />
                        <span
                            className="connection-row__threat-tooltip-level"
                            style={{ color: threatColor }}
                        >
                            {t(`connections.threat.${level}`)}
                        </span>
                        {threatData.confidence !== null && (
                            <span className="connection-row__threat-tooltip-confidence">
                                {Math.round(threatData.confidence * 100)}%
                            </span>
                        )}
                    </div>
                    {threatData.explanation && (
                        <div className="connection-row__threat-tooltip-explanation">
                            {threatData.explanation}
                        </div>
                    )}
                    {threatData.source && (
                        <div className="connection-row__threat-tooltip-source">
                            {threatData.source === 'ai' ? t('connections.source.ai') : t('connections.source.rule')}
                        </div>
                    )}
                </div>
            )}

            {contextMenu && (
                <div
                    ref={contextMenuRef}
                    className="connection-row__context-menu"
                    style={{
                        left: menuPosition?.left ?? contextMenu.x,
                        top: menuPosition?.top ?? contextMenu.y,
                        visibility: menuPosition ? 'visible' : 'hidden',
                    }}
                >
                    <button
                        className="connection-row__context-menu-item"
                        onClick={handleMarkAsSafe}
                    >
                        <ShieldPlus size={14} strokeWidth={1.5} />
                        {t('connections.markAsSafe')}
                    </button>
                </div>
            )}
        </div>
    );
}

export default memo(ConnectionRow);
export type { ConnectionRowProps, ThreatData };
