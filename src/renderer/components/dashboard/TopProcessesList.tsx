import { memo } from 'react';
import { BarChart3, Cpu } from 'lucide-react';
import Card from '../common/Card';
import EmptyState from '../common/EmptyState';
import useConnectionStats from '../../hooks/useConnectionStats';
import { useI18n } from '../../i18n';
import '../../styles/components/top-processes.css';

const BAR_COLORS = [
    '#6366f1',
    '#818cf8',
    '#3b82f6',
    '#22c55e',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#ec4899',
];

const TopProcessesList = memo(function TopProcessesList() {
    const { t } = useI18n();
    const { stats } = useConnectionStats();
    const processes = stats.topProcesses.slice(0, 10);
    const maxCount =
        processes.length > 0
            ? Math.max(...processes.map((p) => p.connectionCount))
            : 1;

    const totalConnections = stats.totalActive;

    return (
        <Card header={t('overview.topProcesses.title')} className="overview__chart-card">
            {processes.length === 0 ? (
                <EmptyState
                    icon={BarChart3}
                    message={t('overview.topProcesses.empty')}
                />
            ) : (
                <div className="top-processes scrollbar-overlay">
                    {processes.map((proc, index) => {
                        const barWidth = (proc.connectionCount / maxCount) * 100;
                        const percentage = totalConnections > 0
                            ? Math.round((proc.connectionCount / totalConnections) * 100)
                            : 0;
                        const color = BAR_COLORS[index % BAR_COLORS.length] ?? '#6366f1';

                        return (
                            <div
                                key={proc.processName}
                                className="top-processes__item"
                            >
                                <div className="top-processes__header">
                                    <div className="top-processes__left">
                                        <div
                                            className="top-processes__icon"
                                            style={{ background: `${color}20`, color }}
                                        >
                                            <Cpu size={12} strokeWidth={2} />
                                        </div>
                                        <span className="top-processes__name">
                                            {proc.processName || t('connections.unknownProcess')}
                                        </span>
                                    </div>
                                    <div className="top-processes__stats">
                                        <span className="top-processes__count">
                                            {proc.connectionCount}
                                        </span>
                                        <span className="top-processes__pct">
                                            {percentage}%
                                        </span>
                                    </div>
                                </div>
                                <div className="top-processes__bar-track">
                                    <div
                                        className="top-processes__bar-fill"
                                        style={{
                                            width: `${barWidth}%`,
                                            background: `linear-gradient(90deg, ${color}, ${color}99)`,
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
});

export default TopProcessesList;
