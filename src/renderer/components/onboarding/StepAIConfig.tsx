import type { AIProvider } from '../../../shared/types';
import Select from '../common/Select';
import type { SelectOption } from '../common/Select';
import { useI18n } from '../../i18n';

interface StepAIConfigProps {
    provider: AIProvider;
    onProviderChange: (provider: AIProvider) => void;
}

function StepAIConfig({ provider, onProviderChange }: StepAIConfigProps) {
    const { t } = useI18n();

    const providers: ReadonlyArray<SelectOption<AIProvider> & { description: string }> = [
        {
            value: 'openai',
            label: t('onboarding.provider.openai'),
            description: t('onboarding.aiProvider.openaiHint'),
        },
        {
            value: 'anthropic',
            label: t('onboarding.provider.anthropic'),
            description: t('onboarding.aiProvider.anthropicHint'),
        },
        {
            value: 'ollama',
            label: t('onboarding.provider.ollama'),
            description: t('onboarding.aiProvider.ollamaHint'),
        },
        {
            value: 'none',
            label: t('onboarding.aiProvider.noneLabel'),
            description: t('onboarding.aiProvider.noneHint'),
        },
    ];

    return (
        <div className="onboarding-field">
            <span id="ai-provider-label" className="onboarding-field__label">
                {t('onboarding.aiProvider.label')}
            </span>

            <Select
                className="onboarding-field__select"
                value={provider}
                options={providers}
                onChange={onProviderChange}
                ariaLabelledBy="ai-provider-label"
            />

            <p className="onboarding-field__hint">
                {providers.find((p) => p.value === provider)?.description}
            </p>
        </div>
    );
}

export default StepAIConfig;
export type { StepAIConfigProps };
