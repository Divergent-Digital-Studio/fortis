import { useState } from 'react';
import { AlertCircle, Eye, EyeOff, RefreshCw, X } from 'lucide-react';
import StatsRow from './StatsRow';
import HealthScoreCard from './HealthScoreCard';
import AIScanCounter from './AIScanCounter';
import MonitoringStatusCard from './MonitoringStatusCard';
import RecentAlertsList from './RecentAlertsList';
import TopProcessesList from './TopProcessesList';
import VpnStatusCard from '../vpn/VpnStatusCard';
import AiPayloadPanel from '../ai/AiPayloadPanel';
import { ConnectionTimeline, ProtocolDistribution } from '../charts';
import { LearningBanner, Button } from '../common';
import useConnectionStats from '../../hooks/useConnectionStats';
import { useI18n } from '../../i18n';
import '../../styles/components/overview.css';

function OverviewView() {
    const { t } = useI18n();
    const [payloadOpen, setPayloadOpen] = useState(false);
    const { error, refresh } = useConnectionStats();
    const [dismissedError, setDismissedError] = useState<string | null>(null);

    const bannerMessage = error !== null && error !== dismissedError ? error : null;

    return (
        <div className="overview">
            <LearningBanner />

            {bannerMessage && (
                <div className="overview__banner" role="alert">
                    <AlertCircle size={14} strokeWidth={1.5} />
                    <span className="overview__banner-message">
                        {t('overview.statsError', { message: bannerMessage })}
                    </span>
                    <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => refresh()}>
                        {t('common.retry')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={X}
                        onClick={() => setDismissedError(bannerMessage)}
                        aria-label={t('common.dismiss')}
                    >
                        {t('common.dismiss')}
                    </Button>
                </div>
            )}

            <StatsRow />

            <div className="overview__middle">
                <ConnectionTimeline />
                <HealthScoreCard />
            </div>

            <div className="overview__bottom">
                <RecentAlertsList />
                <TopProcessesList />
            </div>

            <div className="overview__bottom">
                <ProtocolDistribution />
                <MonitoringStatusCard />
            </div>

            <div className="overview__bottom">
                <VpnStatusCard />
            </div>

            <div className="overview__footer">
                <AIScanCounter />
                <Button
                    variant="ghost"
                    size="sm"
                    icon={payloadOpen ? EyeOff : Eye}
                    onClick={() => setPayloadOpen((open) => !open)}
                    aria-expanded={payloadOpen}
                    aria-controls="overview-ai-payload"
                >
                    {payloadOpen ? t('overview.hideAiPayload') : t('overview.viewAiPayload')}
                </Button>
                {payloadOpen && <AiPayloadPanel />}
            </div>
        </div>
    );
}

export default OverviewView;
