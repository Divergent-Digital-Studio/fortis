import { useState } from 'react';
import { Eye, EyeOff, Key } from 'lucide-react';
import { useI18n } from '../../i18n';

interface StepAPIKeyProps {
    apiKey: string;
    onApiKeyChange: (key: string) => void;
    providerLabel: string;
}

function StepAPIKey({ apiKey, onApiKeyChange, providerLabel }: StepAPIKeyProps) {
    const { t } = useI18n();
    const [isVisible, setIsVisible] = useState(false);

    return (
        <div className="onboarding-field">
            <label className="onboarding-field__label" htmlFor="api-key-input">
                {t('onboarding.apiKey.label', { provider: providerLabel })}
            </label>

            <div className="onboarding-field__input-wrapper">
                <Key size={16} strokeWidth={1.5} className="onboarding-field__input-icon" />
                <input
                    id="api-key-input"
                    className="onboarding-field__input"
                    type={isVisible ? 'text' : 'password'}
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => onApiKeyChange(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                />
                <button
                    type="button"
                    className="onboarding-field__toggle"
                    onClick={() => setIsVisible(!isVisible)}
                    aria-label={isVisible ? t('onboarding.apiKey.hideAria') : t('onboarding.apiKey.showAria')}
                >
                    {isVisible ? (
                        <EyeOff size={16} strokeWidth={1.5} />
                    ) : (
                        <Eye size={16} strokeWidth={1.5} />
                    )}
                </button>
            </div>

            <p className="onboarding-field__hint">
                {t('onboarding.apiKey.hint')}
            </p>
        </div>
    );
}

export default StepAPIKey;
export type { StepAPIKeyProps };
