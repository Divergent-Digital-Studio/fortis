import { memo } from 'react';
import { Zap } from 'lucide-react';
import { isFreeTier } from '@shared/types/ipc';
import useAIStatus from '../../hooks/useAIStatus';
import { useI18n } from '../../i18n';
import '../../styles/components/health-score.css';

const AIScanCounter = memo(function AIScanCounter() {
    const { t } = useI18n();
    const { tierInfo, loading } = useAIStatus();

    if (loading || !tierInfo) return null;

    if (!isFreeTier(tierInfo.tier)) return null;

    const remaining = tierInfo.remainingScans;
    const total = tierInfo.totalAllowedScans;
    const exhausted = remaining <= 0;
    const progressPercent = total > 0 ? (remaining / total) * 100 : 0;

    return (
        <div className={`scan-counter ${exhausted ? 'scan-counter--exhausted' : ''}`}>
            <div className="scan-counter__icon">
                <Zap size={14} strokeWidth={2} />
            </div>
            <div className="scan-counter__content">
                <div className="scan-counter__label">
                    {exhausted
                        ? t('overview.scans.exhausted')
                        : t('overview.scans.remaining', { remaining, total })}
                </div>
                <div className="scan-counter__bar">
                    <div
                        className="scan-counter__fill"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>
        </div>
    );
});

export default AIScanCounter;
