import { useState, useCallback } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useSettings, useScanControl } from '../../hooks';
import { useI18n } from '../../i18n';
import type { AIProvider } from '../../../shared/types';
import OnboardingStep from './OnboardingStep';
import StepAIConfig from './StepAIConfig';
import StepAPIKey from './StepAPIKey';
import StepPreferences from './StepPreferences';
import '../../styles/components/onboarding.css';

const TOTAL_STEPS = 3;

interface WizardState {
    aiProvider: AIProvider;
    apiKey: string;
    autoStart: boolean;
    scanInterval: number;
    adaptiveInterval: boolean;
}

function OnboardingWizard() {
    const { t } = useI18n();
    const { settings, isLoaded, updateSettings } = useSettings();
    const { triggerScan } = useScanControl();
    const [currentStep, setCurrentStep] = useState(1);
    const [completionError, setCompletionError] = useState<string | null>(null);
    const [wizardState, setWizardState] = useState<WizardState>({
        aiProvider: 'none',
        apiKey: '',
        autoStart: true,
        scanInterval: 10000,
        adaptiveInterval: true,
    });

    const handleBack = useCallback(() => {
        setCurrentStep((s) => Math.max(1, s - 1));
    }, []);

    const handleNext = useCallback(() => {
        setCurrentStep((s) => Math.min(TOTAL_STEPS, s + 1));
    }, []);

    const handleSkip = useCallback(() => {
        setCurrentStep((s) => Math.min(TOTAL_STEPS, s + 1));
    }, []);

    const handleComplete = useCallback(async () => {
        setCompletionError(null);

        if (wizardState.apiKey && wizardState.aiProvider !== 'none') {
            try {
                const result = await window.fortis.setApiKey(
                    wizardState.aiProvider,
                    wizardState.apiKey,
                );
                if (!result.success) {
                    setCompletionError(result.error ?? t('onboarding.error.saveKeyRetry'));
                    return;
                }
                setWizardState((s) => ({ ...s, apiKey: '' }));
            } catch (err) {
                const message = err instanceof Error ? err.message : t('onboarding.error.saveKey');
                setCompletionError(message);
                return;
            }
        }

        await updateSettings({
            aiProvider: wizardState.aiProvider,
            autoStart: wizardState.autoStart,
            scanInterval: wizardState.scanInterval,
            adaptiveInterval: wizardState.adaptiveInterval,
            onboardingCompleted: true,
        });

        triggerScan();
    }, [wizardState, updateSettings, triggerScan, t])

    if (!isLoaded || settings.onboardingCompleted) {
        return null;
    }

    return (
        <div className="onboarding-overlay">
            <div className="onboarding-wizard">
                <div className="onboarding-wizard__brand">
                    <ShieldCheck size={28} strokeWidth={1.5} className="onboarding-wizard__logo" />
                    <span className="onboarding-wizard__wordmark">Fortis</span>
                </div>

                <OnboardingStep
                    title={t(`onboarding.step${currentStep}.title`)}
                    description={t(`onboarding.step${currentStep}.description`)}
                    currentStep={currentStep}
                    totalSteps={TOTAL_STEPS}
                    isFirst={currentStep === 1}
                    isLast={currentStep === TOTAL_STEPS}
                    onBack={handleBack}
                    onNext={handleNext}
                    onSkip={handleSkip}
                    onComplete={handleComplete}
                >
                    {currentStep === 1 && (
                        <StepAIConfig
                            provider={wizardState.aiProvider}
                            onProviderChange={(provider) =>
                                setWizardState((s) => ({ ...s, aiProvider: provider }))
                            }
                        />
                    )}

                    {currentStep === 2 && (
                        <StepAPIKey
                            apiKey={wizardState.apiKey}
                            onApiKeyChange={(apiKey) =>
                                setWizardState((s) => ({ ...s, apiKey }))
                            }
                            providerLabel={t(`onboarding.provider.${wizardState.aiProvider}`)}
                        />
                    )}

                    {currentStep === 3 && (
                        <StepPreferences
                            autoStart={wizardState.autoStart}
                            scanInterval={wizardState.scanInterval}
                            adaptiveInterval={wizardState.adaptiveInterval}
                            onAutoStartChange={(autoStart) =>
                                setWizardState((s) => ({ ...s, autoStart }))
                            }
                            onScanIntervalChange={(scanInterval) =>
                                setWizardState((s) => ({ ...s, scanInterval }))
                            }
                            onAdaptiveIntervalChange={(adaptiveInterval) =>
                                setWizardState((s) => ({ ...s, adaptiveInterval }))
                            }
                        />
                    )}

                    {completionError && (
                        <p className="onboarding-wizard__error" role="alert">
                            {completionError}
                        </p>
                    )}
                </OnboardingStep>
            </div>
        </div>
    );
}

export default OnboardingWizard;
