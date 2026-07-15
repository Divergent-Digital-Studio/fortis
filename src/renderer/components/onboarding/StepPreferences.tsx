import { Zap, Timer, Power } from 'lucide-react';
import Select from '../common/Select';
import type { SelectOption } from '../common/Select';
import { useI18n } from '../../i18n';

interface StepPreferencesProps {
    autoStart: boolean;
    scanInterval: number;
    adaptiveInterval: boolean;
    onAutoStartChange: (value: boolean) => void;
    onScanIntervalChange: (value: number) => void;
    onAdaptiveIntervalChange: (value: boolean) => void;
}

const SCAN_INTERVAL_VALUES = [10000, 30000, 60000];

function StepPreferences({
    autoStart,
    scanInterval,
    adaptiveInterval,
    onAutoStartChange,
    onScanIntervalChange,
    onAdaptiveIntervalChange,
}: StepPreferencesProps) {
    const { t, tn } = useI18n();

    const scanIntervalOptions: ReadonlyArray<SelectOption<string>> = SCAN_INTERVAL_VALUES.map(
        (ms) => ({
            value: String(ms),
            label: tn('onboarding.preferences.seconds', ms / 1000),
        }),
    );

    return (
        <div className="onboarding-preferences">
            <div className="onboarding-toggle-row">
                <div className="onboarding-toggle-row__info">
                    <Power size={18} strokeWidth={1.5} className="onboarding-toggle-row__icon" />
                    <div>
                        <span className="onboarding-toggle-row__label">{t('onboarding.preferences.autoStartLabel')}</span>
                        <span className="onboarding-toggle-row__hint">{t('onboarding.preferences.autoStartHint')}</span>
                    </div>
                </div>
                <label className="onboarding-switch" htmlFor="auto-start-toggle">
                    <input
                        id="auto-start-toggle"
                        type="checkbox"
                        checked={autoStart}
                        onChange={(e) => onAutoStartChange(e.target.checked)}
                    />
                    <span className="onboarding-switch__track" />
                </label>
            </div>

            <div className="onboarding-field">
                <div className="onboarding-field__label-row">
                    <Timer size={16} strokeWidth={1.5} />
                    <span id="scan-interval-label" className="onboarding-field__label">
                        {t('onboarding.preferences.scanIntervalLabel')}
                    </span>
                </div>

                <Select
                    className="onboarding-field__select"
                    value={String(scanInterval)}
                    options={scanIntervalOptions}
                    onChange={(value) => onScanIntervalChange(Number(value))}
                    ariaLabelledBy="scan-interval-label"
                />
            </div>

            <div className="onboarding-toggle-row">
                <div className="onboarding-toggle-row__info">
                    <Zap size={18} strokeWidth={1.5} className="onboarding-toggle-row__icon" />
                    <div>
                        <span className="onboarding-toggle-row__label">{t('onboarding.preferences.adaptiveLabel')}</span>
                        <span className="onboarding-toggle-row__hint">{t('onboarding.preferences.adaptiveHint')}</span>
                    </div>
                </div>
                <label className="onboarding-switch" htmlFor="adaptive-interval-toggle">
                    <input
                        id="adaptive-interval-toggle"
                        type="checkbox"
                        checked={adaptiveInterval}
                        onChange={(e) => onAdaptiveIntervalChange(e.target.checked)}
                    />
                    <span className="onboarding-switch__track" />
                </label>
            </div>
        </div>
    );
}

export default StepPreferences;
export type { StepPreferencesProps };
