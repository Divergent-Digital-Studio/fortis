import { useCallback, useId } from 'react';
import { Radar, ShieldAlert, Shield, ShieldOff } from 'lucide-react';
import type { SensitivityLevel } from '../../types';
import Card from '../common/Card';
import Select from '../common/Select';
import type { SelectOption } from '../common/Select';
import { useI18n } from '../../i18n';

interface ScanningSectionProps {
    scanInterval: number;
    adaptiveInterval: boolean;
    sensitivityLevel: SensitivityLevel;
    onScanIntervalChange: (interval: number) => void;
    onAdaptiveIntervalChange: (enabled: boolean) => void;
    onSensitivityChange: (level: SensitivityLevel) => void;
}

const SENSITIVITY_OPTIONS: {
    value: SensitivityLevel;
    labelKey: string;
    descriptionKey: string;
    icon: typeof Shield;
}[] = [
        {
            value: 'paranoid',
            labelKey: 'settings.scanning.paranoid',
            descriptionKey: 'settings.scanning.paranoidDesc',
            icon: ShieldAlert,
        },
        {
            value: 'balanced',
            labelKey: 'settings.scanning.balanced',
            descriptionKey: 'settings.scanning.balancedDesc',
            icon: Shield,
        },
        {
            value: 'relaxed',
            labelKey: 'settings.scanning.relaxed',
            descriptionKey: 'settings.scanning.relaxedDesc',
            icon: ShieldOff,
        },
    ];

function ScanningSection({
    scanInterval,
    adaptiveInterval,
    sensitivityLevel,
    onScanIntervalChange,
    onAdaptiveIntervalChange,
    onSensitivityChange,
}: ScanningSectionProps) {
    const { t, tn } = useI18n();
    const intervalId = useId();

    const scanIntervals: ReadonlyArray<SelectOption<string>> = [
        { value: '5000', label: tn('settings.scanning.seconds', 5) },
        { value: '10000', label: tn('settings.scanning.seconds', 10) },
        { value: '30000', label: tn('settings.scanning.seconds', 30) },
        { value: '60000', label: tn('settings.scanning.seconds', 60) },
    ];
    const adaptiveId = useId();

    const handleIntervalChange = useCallback((value: string) => {
        onScanIntervalChange(Number(value));
    }, [onScanIntervalChange]);

    const handleAdaptiveChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onAdaptiveIntervalChange(e.target.checked);
    }, [onAdaptiveIntervalChange]);

    const handleSensitivitySelect = useCallback((level: SensitivityLevel) => {
        onSensitivityChange(level);
    }, [onSensitivityChange]);

    const activeOption = SENSITIVITY_OPTIONS.find(o => o.value === sensitivityLevel) ?? SENSITIVITY_OPTIONS[1]!;

    return (
        <Card
            header={
                <div className="settings-section__header">
                    <Radar size={18} strokeWidth={1.5} className="settings-section__icon" />
                    <span className="settings-section__title">{t('settings.scanning.title')}</span>
                </div>
            }
        >
            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={intervalId} className="settings-field__label">{t('settings.scanning.interval')}</label>
                    <span className="settings-field__hint">{t('settings.scanning.intervalHint')}</span>
                </div>
                <div className="settings-field__control">
                    <Select
                        id={intervalId}
                        className="settings-select"
                        value={String(scanInterval)}
                        options={scanIntervals}
                        onChange={handleIntervalChange}
                    />
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={adaptiveId} className="settings-field__label">{t('settings.scanning.adaptive')}</label>
                    <span className="settings-field__hint">
                        {t('settings.scanning.adaptiveHint')}
                    </span>
                </div>
                <div className="settings-field__control">
                    <label className="settings-toggle">
                        <input
                            id={adaptiveId}
                            type="checkbox"
                            className="settings-toggle__input"
                            checked={adaptiveInterval}
                            onChange={handleAdaptiveChange}
                        />
                        <span className="settings-toggle__track" />
                    </label>
                </div>
            </div>

            <div className="settings-field settings-field--vertical">
                <div className="settings-field__label-group">
                    <span className="settings-field__label">{t('settings.scanning.sensitivity')}</span>
                    <span className="settings-field__hint">
                        {t('settings.scanning.sensitivityHint')}
                    </span>
                </div>
                <div className="sensitivity-control">
                    <div className="sensitivity-segments" role="radiogroup" aria-label={t('settings.scanning.sensitivity')}>
                        {SENSITIVITY_OPTIONS.map(option => {
                            const Icon = option.icon;
                            const isActive = sensitivityLevel === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`sensitivity-segment ${isActive ? 'sensitivity-segment--active' : ''} sensitivity-segment--${option.value}`}
                                    onClick={() => handleSensitivitySelect(option.value)}
                                >
                                    <Icon size={14} strokeWidth={1.5} />
                                    <span>{t(option.labelKey)}</span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="sensitivity-description" aria-live="polite">
                        {t(activeOption.descriptionKey)}
                    </p>
                </div>
            </div>
        </Card>
    );
}

export default ScanningSection;
