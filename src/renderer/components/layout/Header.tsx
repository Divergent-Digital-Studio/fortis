import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { Scan, Zap, BookOpen } from 'lucide-react';
import { useUIStore } from '../../stores';
import { useI18n } from '../../i18n';
import { Button, UpgradePrompt } from '../common';
import useAIStatus from '../../hooks/useAIStatus';
import type { LearningStatusPayload } from '@shared/types/ipc';
import type { ViewType } from '../../types';
import '../../styles/components/header.css';

const VIEW_TITLES: Record<ViewType, string> = {
    overview: 'Overview',
    connections: 'Connections',
    alerts: 'Alerts',
    settings: 'Settings',
    devices: 'Devices',
    dns: 'DNS',
    geo: 'Geo Map',
    iot: 'IoT Devices',
    reports: 'Reports',
    flow: 'Connection Flow',
    defense: 'Active Defense',
    bandwidth: 'Bandwidth',
    remote: 'Remote Agents',
    admin: 'Admin Console',
    community: 'Community Intel',
};

type StatusMode = 'active' | 'paused' | 'stopped' | 'error' | 'scanning';

interface HeaderProps {
    statusMode?: StatusMode | undefined;
    onScanNow?: (() => void) | undefined;
    onUpgrade?: (() => void) | undefined;
}

const STATUS_LABELS: Record<StatusMode, string> = {
    active: 'Monitoring',
    paused: 'Paused',
    stopped: 'Stopped',
    error: 'Error',
    scanning: 'Scanning...',
};

const ScanCounter = memo(function ScanCounter() {
    const { tierInfo } = useAIStatus();

    if (!tierInfo || tierInfo.tier !== 'free') return null;

    const remaining = tierInfo.remainingScans;
    const total = tierInfo.totalAllowedScans;
    const exhausted = remaining <= 0;

    return (
        <span className={`header__scan-counter ${exhausted ? 'header__scan-counter--exhausted' : ''}`}>
            <Zap size={12} strokeWidth={2} />
            <span>{remaining}/{total} AI Scans</span>
        </span>
    );
});

const LearningBadge = memo(function LearningBadge() {
    const [learningStatus, setLearningStatus] = useState<LearningStatusPayload | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            const tierInfo = await window.fortis.getTierInfo();
            if (tierInfo.isLearningPeriod) {
                setLearningStatus({
                    isLearningPeriod: true,
                    daysRemaining: tierInfo.learningDaysRemaining,
                    complete: false,
                    baselineCount: 0,
                });
            } else {
                setLearningStatus(null);
            }
        } catch {
            setLearningStatus(null);
        }
    }, []);

    useEffect(() => {
        fetchStatus();

        const unsubLearning = window.fortis.onLearningStatus((status) => {
            if (status.complete || !status.isLearningPeriod) {
                setLearningStatus(null);
            } else {
                setLearningStatus(status);
            }
        });

        cleanupRef.current = unsubLearning;

        return () => {
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }
        };
    }, [fetchStatus]);

    if (!learningStatus || !learningStatus.isLearningPeriod) return null;

    return (
        <span className="header__learning-badge">
            <BookOpen size={12} strokeWidth={1.5} />
            <span>Learning Mode ({learningStatus.daysRemaining} days left)</span>
        </span>
    );
});

function Header({ statusMode = 'stopped', onScanNow, onUpgrade }: HeaderProps) {
    const { t } = useI18n();
    const activeView = useUIStore((state) => state.activeView);
    const { tierInfo } = useAIStatus();
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    const isFree = tierInfo?.tier === 'free';
    const scansExhausted = isFree && tierInfo && tierInfo.remainingScans <= 0;

    const titleKey = `header.${activeView}`;
    const translatedTitle = t(titleKey);
    const title = translatedTitle === titleKey ? VIEW_TITLES[activeView] : translatedTitle;

    const dotClass = `header__status-dot header__status-dot--${statusMode}`;

    const handleScanNow = useCallback(() => {
        if (scansExhausted) {
            setShowUpgradeModal(true);
            return;
        }
        onScanNow?.();
    }, [scansExhausted, onScanNow]);

    const handleDismissUpgrade = useCallback(() => {
        setShowUpgradeModal(false);
    }, []);

    return (
        <header className="header">
            <div className="header__left">
                <h1 className="header__title">{title}</h1>
            </div>

            <div className="header__right">
                <LearningBadge />

                <div className="header__status">
                    <span className={dotClass} />
                    <span>{STATUS_LABELS[statusMode]}</span>
                </div>

                <div className="header__scan-group">
                    <ScanCounter />

                    <div className="header__scan-btn-wrapper">
                        <Button
                            variant="secondary"
                            size="sm"
                            icon={Scan}
                            disabled={!onScanNow && !scansExhausted}
                            onClick={handleScanNow}
                            className={scansExhausted ? 'header__scan-btn--exhausted' : ''}
                        >
                            Scan Now
                        </Button>

                    </div>
                </div>
            </div>

            <UpgradePrompt
                isOpen={showUpgradeModal}
                onDismiss={handleDismissUpgrade}
                {...(onUpgrade ? { onUpgrade } : {})}
            />
        </header>
    );
}

export default Header;
export type { HeaderProps, StatusMode };
