import { memo, useMemo, useState } from 'react';
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
} from 'recharts';
import Card from '../common/Card';
import EmptyState from '../common/EmptyState';
import ViewToggle from '../common/ViewToggle';
import type { ViewToggleOption } from '../common/ViewToggle';
import HubOrbit from '../common/HubOrbit';
import type { HubNode } from '../common/HubOrbit';
import { PieChart as PieChartIcon, List, Orbit } from 'lucide-react';
import useConnectionStats from '../../hooks/useConnectionStats';
import useViewMode from '../../hooks/useViewMode';
import { useI18n } from '../../i18n';
import '../../styles/components/protocol-distribution.css';

interface ProtocolSlice {
    name: string;
    value: number;
    color: string;
}

const COLORS = {
    TCP: '#6366f1',
    UDP: '#22c55e',
    Established: '#3b82f6',
    Listening: '#f59e0b',
    Other: '#6b6b82',
};

type ProtocolViewMode = 'chart' | 'list' | 'visual';

const VIEW_MODES: readonly ProtocolViewMode[] = ['chart', 'list', 'visual'];

function renderTooltip({
    active,
    payload,
}: {
    active?: boolean;
    payload?: ReadonlyArray<{ payload: ProtocolSlice; value: number }>;
}) {
    if (!active || !payload || payload.length === 0) return null;

    const entry = payload[0];
    if (!entry) return null;
    const slice = entry.payload;

    return (
        <div className="protocol-tooltip">
            <span
                className="protocol-tooltip__dot"
                style={{ background: slice.color }}
            />
            <span className="protocol-tooltip__label">{slice.name}</span>
            <span className="protocol-tooltip__value">{slice.value}</span>
        </div>
    );
}

function ProtocolPie({ protocolData, stateData }: { protocolData: ProtocolSlice[]; stateData: ProtocolSlice[] }) {
    const allSlices = [...protocolData, ...stateData];

    return (
        <div className="protocol-distribution">
            <div className="protocol-distribution__chart">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={protocolData}
                            cx="50%"
                            cy="50%"
                            innerRadius="55%"
                            outerRadius="80%"
                            paddingAngle={3}
                            dataKey="value"
                            stroke="none"
                        >
                            {protocolData.map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                            ))}
                        </Pie>

                        <Pie
                            data={stateData}
                            cx="50%"
                            cy="50%"
                            innerRadius="25%"
                            outerRadius="50%"
                            paddingAngle={2}
                            dataKey="value"
                            stroke="none"
                        >
                            {stateData.map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                            ))}
                        </Pie>

                        <Tooltip content={renderTooltip} />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            <div className="protocol-distribution__legend">
                {allSlices.map((slice) => (
                    <div
                        key={slice.name}
                        className="protocol-distribution__legend-item"
                    >
                        <span
                            className="protocol-distribution__legend-dot"
                            style={{ background: slice.color }}
                        />
                        <span className="protocol-distribution__legend-label">
                            {slice.name}
                        </span>
                        <span className="protocol-distribution__legend-value">
                            {slice.value}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ProtocolList({
    protocolData,
    stateData,
    totalActive,
}: {
    protocolData: ProtocolSlice[];
    stateData: ProtocolSlice[];
    totalActive: number;
}) {
    const { t } = useI18n();
    const groups: Array<{ title: string; slices: ProtocolSlice[] }> = [
        { title: t('charts.protocol.protocols'), slices: protocolData },
        { title: t('charts.protocol.states'), slices: stateData },
    ];

    return (
        <div className="protocol-distribution__list scrollbar-overlay">
            {groups.map((group) =>
                group.slices.length === 0 ? null : (
                    <div key={group.title} className="protocol-distribution__list-group">
                        <span className="protocol-distribution__list-title">
                            {group.title}
                        </span>
                        {group.slices.map((slice) => {
                            const percentage = totalActive > 0
                                ? Math.round((slice.value / totalActive) * 100)
                                : 0;
                            return (
                                <div key={slice.name} className="protocol-distribution__list-row">
                                    <span
                                        className="protocol-distribution__legend-dot"
                                        style={{ background: slice.color }}
                                    />
                                    <span className="protocol-distribution__list-label">
                                        {slice.name}
                                    </span>
                                    <div className="protocol-distribution__list-track">
                                        <div
                                            className="protocol-distribution__list-fill"
                                            style={{ width: `${percentage}%`, background: slice.color }}
                                        />
                                    </div>
                                    <span className="protocol-distribution__legend-value">
                                        {slice.value}
                                    </span>
                                    <span className="protocol-distribution__list-pct">
                                        {percentage}%
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                ),
            )}
        </div>
    );
}

function ProtocolOrbit({ protocolData, stateData }: { protocolData: ProtocolSlice[]; stateData: ProtocolSlice[] }) {
    const { t } = useI18n();
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const nodes = useMemo<HubNode[]>(
        () => [
            ...protocolData.map((slice) => ({
                id: `protocol:${slice.name}`,
                label: `${slice.name} · ${slice.value}`,
                weight: slice.value,
                outer: true,
            })),
            ...stateData.map((slice) => ({
                id: `state:${slice.name}`,
                label: `${slice.name} · ${slice.value}`,
                weight: slice.value,
                outer: false,
            })),
        ],
        [protocolData, stateData],
    );

    return (
        <div className="protocol-distribution__orbit">
            <HubOrbit
                nodes={nodes}
                hubLabel={t('connections.hubLabel')}
                selectedId={selectedId}
                onSelect={setSelectedId}
                ariaLabel={t('charts.protocol.orbitAria')}
            />
        </div>
    );
}

const ProtocolDistribution = memo(function ProtocolDistribution() {
    const { t } = useI18n();
    const { stats } = useConnectionStats();
    const [mode, setMode] = useViewMode<ProtocolViewMode>('overview.protocol', VIEW_MODES, 'chart');

    const viewOptions = useMemo<ReadonlyArray<ViewToggleOption<ProtocolViewMode>>>(
        () => [
            { mode: 'chart', label: t('charts.protocol.view.chart'), icon: PieChartIcon },
            { mode: 'list', label: t('charts.protocol.view.list'), icon: List },
            { mode: 'visual', label: t('charts.protocol.view.visual'), icon: Orbit },
        ],
        [t],
    );

    const protocolData = useMemo<ProtocolSlice[]>(() => {
        const slices: ProtocolSlice[] = [];

        if (stats.totalTcp > 0) {
            slices.push({ name: 'TCP', value: stats.totalTcp, color: COLORS.TCP });
        }
        if (stats.totalUdp > 0) {
            slices.push({ name: 'UDP', value: stats.totalUdp, color: COLORS.UDP });
        }

        return slices;
    }, [stats.totalTcp, stats.totalUdp]);

    const stateData = useMemo<ProtocolSlice[]>(() => {
        const slices: ProtocolSlice[] = [];

        if (stats.totalEstablished > 0) {
            slices.push({ name: t('charts.protocol.established'), value: stats.totalEstablished, color: COLORS.Established });
        }
        if (stats.totalListening > 0) {
            slices.push({ name: t('charts.protocol.listening'), value: stats.totalListening, color: COLORS.Listening });
        }

        const otherCount = stats.totalActive - stats.totalEstablished - stats.totalListening;
        if (otherCount > 0) {
            slices.push({ name: t('charts.protocol.other'), value: otherCount, color: COLORS.Other });
        }

        return slices;
    }, [stats.totalActive, stats.totalEstablished, stats.totalListening, t]);

    const hasData = stats.totalActive > 0;

    return (
        <Card
            header={t('charts.protocol.title')}
            headerActions={
                <ViewToggle
                    mode={mode}
                    onChange={setMode}
                    options={viewOptions}
                    compact
                />
            }
            className="overview__chart-card"
        >
            {!hasData ? (
                <EmptyState
                    icon={PieChartIcon}
                    message={t('connections.empty.title')}
                />
            ) : mode === 'list' ? (
                <ProtocolList
                    protocolData={protocolData}
                    stateData={stateData}
                    totalActive={stats.totalActive}
                />
            ) : mode === 'visual' ? (
                <ProtocolOrbit protocolData={protocolData} stateData={stateData} />
            ) : (
                <ProtocolPie protocolData={protocolData} stateData={stateData} />
            )}
        </Card>
    );
});

export default ProtocolDistribution;
