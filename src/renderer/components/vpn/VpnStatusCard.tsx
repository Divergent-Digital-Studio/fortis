import { memo } from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, Badge } from '../common';
import type { BadgeVariant } from '../common';
import type { VpnVerdict } from '@shared/types/m1';
import useVpnStatus from '../../hooks/useVpnStatus';
import { useI18n } from '../../i18n';
import '../../styles/components/vpn-status-card.css';

const VERDICT_BADGE_VARIANT: Record<VpnVerdict, BadgeVariant> = {
    pass: 'safe',
    warn: 'warning',
    fail: 'danger',
};

const VERDICT_LABEL_KEY: Record<VpnVerdict, string> = {
    pass: 'vpn.verdict.pass',
    warn: 'vpn.verdict.warn',
    fail: 'vpn.verdict.fail',
};

const VERDICT_ICON: Record<VpnVerdict, LucideIcon> = {
    pass: ShieldCheck,
    warn: ShieldAlert,
    fail: ShieldAlert,
};

const VpnStatusCard = memo(function VpnStatusCard() {
    const { t } = useI18n();
    const { status } = useVpnStatus();

    const HeaderIcon = status ? VERDICT_ICON[status.verdict] : ShieldCheck;

    return (
        <Card
            header={t('vpn.title')}
            headerActions={<HeaderIcon size={16} strokeWidth={1.5} />}
        >
            {status === null ? (
                <div className="vpn-status vpn-status--loading">
                    <span className="vpn-status__checking">{t('vpn.checking')}</span>
                </div>
            ) : (
                <div className="vpn-status">
                    <div className="vpn-status__verdict">
                        <Badge variant={VERDICT_BADGE_VARIANT[status.verdict]}>
                            {t(VERDICT_LABEL_KEY[status.verdict])}
                        </Badge>
                    </div>

                    <p className="vpn-status__explanation">{status.explanation}</p>

                    {status.tunnelInterface && (
                        <div className="vpn-status__meta">
                            <span className="vpn-status__meta-label">{t('vpn.tunnel')}</span>
                            <span className="vpn-status__meta-value">
                                {status.tunnelInterface}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
});

export default VpnStatusCard;
