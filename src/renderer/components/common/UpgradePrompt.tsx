import { memo } from 'react';
import {
    Shield,
    ShieldCheck,
    Zap,
    Check,
    X,
    Minus,
    Crown,
} from 'lucide-react';
import { Button } from './index';
import ModalShell from './ModalShell';
import { useI18n } from '../../i18n';
import { TIER_LABELS } from '@shared/types/ipc';
import '../../styles/components/upgrade-prompt.css';

interface UpgradePromptProps {
    isOpen: boolean;
    onDismiss: () => void;
    onUpgrade?: () => void;
}

interface FeatureRow {
    labelKey: string;
    free: string | boolean;
    paid: string | boolean;
}

const TIER_FEATURES: FeatureRow[] = [
    { labelKey: 'common.upgrade.feature.ruleBased', free: true, paid: true },
    { labelKey: 'common.upgrade.feature.aiScans', free: 'common.upgrade.value.threePerDay', paid: 'common.upgrade.value.unlimited' },
    { labelKey: 'common.upgrade.feature.autoTriggers', free: false, paid: true },
    { labelKey: 'common.upgrade.feature.notifications', free: false, paid: true },
    { labelKey: 'common.upgrade.feature.alertHistory', free: 'common.upgrade.value.last24h', paid: 'common.upgrade.value.full' },
];

function FeatureCell({ value, t }: { value: string | boolean; t: (key: string) => string }) {
    if (typeof value === 'boolean') {
        return value ? (
            <span className="upgrade-prompt__check">
                <Check size={14} strokeWidth={2} />
            </span>
        ) : (
            <span className="upgrade-prompt__dash">
                <Minus size={14} strokeWidth={2} />
            </span>
        );
    }
    return <span className="upgrade-prompt__cell-text">{t(value)}</span>;
}

const UpgradePrompt = memo(function UpgradePrompt({
    isOpen,
    onDismiss,
    onUpgrade,
}: UpgradePromptProps) {
    const { t } = useI18n();

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onDismiss}
            labelledBy="upgrade-prompt-title"
            overlayClassName="upgrade-prompt__overlay"
            cardClassName="upgrade-prompt__card"
        >
            <button
                className="upgrade-prompt__close"
                onClick={onDismiss}
                aria-label={t('common.upgrade.closeAria')}
                type="button"
            >
                <X size={16} strokeWidth={1.5} />
            </button>

            <div className="upgrade-prompt__header">
                <div className="upgrade-prompt__icon-badge">
                    <Crown size={20} strokeWidth={1.5} />
                </div>
                <h2 id="upgrade-prompt-title" className="upgrade-prompt__title">
                    {t('common.upgrade.title')}
                </h2>
                <p className="upgrade-prompt__subtitle">
                    {t('common.upgrade.subtitlePrefix')}{' '}
                    <strong>{TIER_LABELS.pro}</strong> {t('common.upgrade.subtitleSuffix')}
                </p>
            </div>

            <div className="upgrade-prompt__comparison">
                <div className="upgrade-prompt__tier-headers">
                    <div className="upgrade-prompt__tier-label" />
                    <div className="upgrade-prompt__tier-col upgrade-prompt__tier-col--free">
                        <Shield size={16} strokeWidth={1.5} />
                        <span>{TIER_LABELS.free}</span>
                        <span className="upgrade-prompt__tier-price">{t('common.upgrade.priceFree')}</span>
                    </div>
                    <div className="upgrade-prompt__tier-col upgrade-prompt__tier-col--paid">
                        <ShieldCheck size={16} strokeWidth={1.5} />
                        <span>{TIER_LABELS.pro}</span>
                        <span className="upgrade-prompt__tier-price">{t('common.upgrade.pricePaid')}</span>
                    </div>
                </div>

                <div className="upgrade-prompt__feature-list">
                    {TIER_FEATURES.map((feature) => (
                        <div key={feature.labelKey} className="upgrade-prompt__feature-row">
                            <span className="upgrade-prompt__feature-label">
                                {t(feature.labelKey)}
                            </span>
                            <span className="upgrade-prompt__feature-value upgrade-prompt__feature-value--free">
                                <FeatureCell value={feature.free} t={t} />
                            </span>
                            <span className="upgrade-prompt__feature-value upgrade-prompt__feature-value--paid">
                                <FeatureCell value={feature.paid} t={t} />
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="upgrade-prompt__actions">
                <Button
                    variant="primary"
                    size="lg"
                    icon={Zap}
                    onClick={onUpgrade}
                    className="upgrade-prompt__cta"
                >
                    {t('common.upgrade.cta', { tier: TIER_LABELS.pro })}
                </Button>
                <button
                    className="upgrade-prompt__dismiss-link"
                    onClick={onDismiss}
                    type="button"
                >
                    {t('common.upgrade.maybeLater')}
                </button>
            </div>
        </ModalShell>
    );
});

export default UpgradePrompt;
export type { UpgradePromptProps };
