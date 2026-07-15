import { useMemo, useState } from 'react';
import { Network, Cpu, AlertTriangle, Brain, Wifi, Globe, Globe2, Cctv, Lock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import StatCard from './StatCard';
import type { IconVariant } from './StatCard';
import { UpgradePrompt } from '../common';
import useConnectionStats from '../../hooks/useConnectionStats';
import useDevices from '../../hooks/useDevices';
import useDnsQueries from '../../hooks/useDnsQueries';
import useGeoConnections from '../../hooks/useGeoConnections';
import useIotDevices from '../../hooks/useIotDevices';
import { useSettingsStore, selectTier } from '../../stores';
import { useAlertStore } from '../../stores/alert-store';
import { useUIStore } from '../../stores/ui-store';
import { useI18n } from '../../i18n';

interface LockedStatCardProps {
    icon: LucideIcon;
    label: string;
    variant: IconVariant;
    onUnlock: () => void;
}

function LockedStatCard({ icon, label, variant, onUnlock }: LockedStatCardProps) {
    const { t } = useI18n();
    return (
        <button type="button" className="stat-card__lock-wrap" onClick={onUnlock} aria-label={t('overview.stat.lockAria', { label })}>
            <div className="stat-card__locked">
                <StatCard icon={icon} value="—" label={label} variant={variant} />
            </div>
            <span className="stat-card__lock-badge">
                <Lock size={14} strokeWidth={1.5} />
            </span>
        </button>
    );
}

function VisibilityStats() {
    const { t } = useI18n();
    const { devices } = useDevices();
    const { records } = useDnsQueries();
    const { connections: geoConnections } = useGeoConnections();
    const { devices: iotDevices } = useIotDevices();

    const countryCount = useMemo(() => {
        const set = new Set<string>();
        for (const conn of geoConnections) {
            if (conn.countryCode) set.add(conn.countryCode);
        }
        return set.size;
    }, [geoConnections]);

    return (
        <>
            <StatCard icon={Wifi} value={devices.length} label={t('overview.stat.devices')} variant="info" />
            <StatCard icon={Globe} value={records.length} label={t('overview.stat.dnsDomains')} variant="default" />
            <StatCard icon={Globe2} value={countryCount} label={t('overview.stat.countries')} variant="warning" />
            <StatCard icon={Cctv} value={iotDevices.length} label={t('overview.stat.iotDevices')} variant="safe" />
        </>
    );
}

function StatsRow() {
    const { t } = useI18n();
    const { stats } = useConnectionStats();
    const aiProvider = useSettingsStore((s) => s.settings.aiProvider);
    const tier = useSettingsStore(selectTier);
    const flaggedCount = useAlertStore((s) => s.alertCounts.unacknowledged);
    const isFree = tier === 'free';

    const [upgradeOpen, setUpgradeOpen] = useState(false);

    const aiStatusLabel = aiProvider !== 'none' ? t('overview.stat.aiConfigured') : t('overview.stat.noAi');
    const openUpgrade = () => setUpgradeOpen(true);

    const handleUpgrade = (): void => {
        setUpgradeOpen(false);
        useUIStore.getState().setLicenseDialogOpen(true);
    };

    return (
        <>
            <div className="stats-row stats-row--grid">
                <StatCard icon={Network} value={stats.totalActive} label={t('overview.stat.activeConnections')} variant="default" />
                <StatCard icon={Cpu} value={stats.uniqueProcesses} label={t('overview.stat.activeProcesses')} variant="info" />
                <StatCard icon={AlertTriangle} value={flaggedCount} label={t('overview.stat.flaggedConnections')} variant="warning" />
                <StatCard icon={Brain} value={aiStatusLabel} label={t('overview.stat.aiProvider')} variant="safe" />
                {isFree ? (
                    <>
                        <LockedStatCard icon={Wifi} label={t('overview.stat.devices')} variant="info" onUnlock={openUpgrade} />
                        <LockedStatCard icon={Globe} label={t('overview.stat.dnsDomains')} variant="default" onUnlock={openUpgrade} />
                        <LockedStatCard icon={Globe2} label={t('overview.stat.countries')} variant="warning" onUnlock={openUpgrade} />
                        <LockedStatCard icon={Cctv} label={t('overview.stat.iotDevices')} variant="safe" onUnlock={openUpgrade} />
                    </>
                ) : (
                    <VisibilityStats />
                )}
            </div>
            <UpgradePrompt isOpen={upgradeOpen} onDismiss={() => setUpgradeOpen(false)} onUpgrade={handleUpgrade} />
        </>
    );
}

export default StatsRow;
