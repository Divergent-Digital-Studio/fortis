import { memo, useCallback, useMemo } from 'react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import Card from '../common/Card';
import useConnectionTimeline from '../../hooks/useConnectionTimeline';
import { useSettingsStore } from '../../stores/settings-store';
import { resolveTheme } from '../../styles/theme';
import { useI18n } from '../../i18n';
import '../../styles/components/timeline.css';

interface ChartDataPoint {
    time: string;
    timestamp: number;
    connections: number;
}

function formatTime(ts: number): string {
    const date = new Date(ts);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function formatTooltipTime(ts: number): string {
    const date = new Date(ts);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

type TranslatePlural = (key: string, count: number, vars?: Record<string, string | number>) => string;

interface TooltipRenderProps {
    active?: boolean;
    payload?: ReadonlyArray<{ payload: ChartDataPoint }>;
}

function renderTooltip({ active, payload }: TooltipRenderProps, tn: TranslatePlural) {
    if (!active || !payload || payload.length === 0) {
        return null;
    }

    const entry = payload[0];
    if (!entry) return null;
    const point = entry.payload;

    return (
        <div className="timeline-tooltip">
            <div className="timeline-tooltip__time">
                {formatTooltipTime(point.timestamp)}
            </div>
            <div className="timeline-tooltip__value">
                <span className="timeline-tooltip__dot" />
                {tn('connections.count', point.connections)}
            </div>
        </div>
    );
}

const GRADIENT_ID = 'connectionTimelineGradient';
const SIGNAL_COLOR = '#6366f1';

const CHART_THEME_COLORS = {
    dark: { axis: '#8b8b9e', dotStroke: '#0a0a0f' },
    light: { axis: '#4b5563', dotStroke: '#f5f6fa' },
} as const;

function prefersLight(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-color-scheme: light)').matches;
}

const ConnectionTimeline = memo(function ConnectionTimeline() {
    const { t, tn } = useI18n();
    const { data, isLoading } = useConnectionTimeline();
    const tooltipContent = useCallback(
        (props: TooltipRenderProps) => renderTooltip(props, tn),
        [tn],
    );
    const themeSetting = useSettingsStore((s) => s.settings.theme);
    const { axis: INK_SECONDARY, dotStroke: VOID_COLOR } = useMemo(
        () => CHART_THEME_COLORS[resolveTheme(themeSetting, prefersLight())],
        [themeSetting],
    );

    const chartData = useMemo<ChartDataPoint[]>(() => {
        if (!data || data.length === 0) return [];
        return data.map((point) => ({
            time: formatTime(point.timestamp),
            timestamp: point.timestamp,
            connections: point.value,
        }));
    }, [data]);

    const yDomain = useMemo<[number, number | 'auto']>(() => {
        if (chartData.length === 0) return [0, 'auto'];
        const maxVal = Math.max(...chartData.map((d) => d.connections));
        return [0, Math.max(maxVal + 1, 5)];
    }, [chartData]);

    const hasData = chartData.length > 0;

    return (
        <Card header={t('charts.timeline.title')}>
            {isLoading || !hasData ? (
                <div className="timeline-chart__empty">
                    {isLoading ? t('charts.timeline.loading') : t('charts.timeline.empty')}
                </div>
            ) : (
                <div className="timeline-chart">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={chartData}
                            margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient
                                    id={GRADIENT_ID}
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                >
                                    <stop
                                        offset="0%"
                                        stopColor={SIGNAL_COLOR}
                                        stopOpacity={0.2}
                                    />
                                    <stop
                                        offset="100%"
                                        stopColor={SIGNAL_COLOR}
                                        stopOpacity={0}
                                    />
                                </linearGradient>
                            </defs>

                            <XAxis
                                dataKey="time"
                                stroke={INK_SECONDARY}
                                tick={{ fontSize: 11, fill: INK_SECONDARY }}
                                tickLine={false}
                                axisLine={false}
                                interval="preserveStartEnd"
                            />

                            <YAxis
                                stroke={INK_SECONDARY}
                                tick={{ fontSize: 11, fill: INK_SECONDARY }}
                                tickLine={false}
                                axisLine={false}
                                domain={yDomain}
                                allowDecimals={false}
                                width={40}
                            />

                            <Tooltip
                                content={tooltipContent}
                                cursor={{
                                    stroke: SIGNAL_COLOR,
                                    strokeOpacity: 0.3,
                                    strokeWidth: 1,
                                }}
                            />

                            <Area
                                type="monotone"
                                dataKey="connections"
                                stroke={SIGNAL_COLOR}
                                strokeWidth={2}
                                fill={`url(#${GRADIENT_ID})`}
                                fillOpacity={1}
                                dot={false}
                                activeDot={{
                                    r: 4,
                                    fill: SIGNAL_COLOR,
                                    stroke: VOID_COLOR,
                                    strokeWidth: 2,
                                }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Card>
    );
});

export default ConnectionTimeline;
