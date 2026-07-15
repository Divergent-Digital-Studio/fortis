import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, SkipForward, Rocket } from 'lucide-react';
import Button from '../common/Button';
import { useI18n } from '../../i18n';

interface OnboardingStepProps {
    title: string;
    description: string;
    children: ReactNode;
    currentStep: number;
    totalSteps: number;
    isFirst: boolean;
    isLast: boolean;
    onBack: () => void;
    onNext: () => void;
    onSkip: () => void;
    onComplete: () => void;
}

function OnboardingStep({
    title,
    description,
    children,
    currentStep,
    totalSteps,
    isFirst,
    isLast,
    onBack,
    onNext,
    onSkip,
    onComplete,
}: OnboardingStepProps) {
    const { t } = useI18n();
    return (
        <div className="onboarding-step">
            <div className="onboarding-step__progress">
                {Array.from({ length: totalSteps }, (_, i) => (
                    <span
                        key={i}
                        className={`onboarding-step__dot ${i + 1 === currentStep ? 'onboarding-step__dot--active' : ''} ${i + 1 < currentStep ? 'onboarding-step__dot--completed' : ''}`}
                    />
                ))}
            </div>

            <div className="onboarding-step__header">
                <h2 className="onboarding-step__title">{title}</h2>
                <p className="onboarding-step__description">{description}</p>
            </div>

            <div className="onboarding-step__content">{children}</div>

            <div className="onboarding-step__actions">
                <div className="onboarding-step__actions-left">
                    {!isFirst && (
                        <Button
                            variant="ghost"
                            icon={ArrowLeft}
                            onClick={onBack}
                        >
                            {t('onboarding.back')}
                        </Button>
                    )}
                </div>

                <div className="onboarding-step__actions-right">
                    {!isLast && (
                        <Button
                            variant="ghost"
                            icon={SkipForward}
                            onClick={onSkip}
                        >
                            {t('onboarding.skip')}
                        </Button>
                    )}

                    {isLast ? (
                        <Button
                            variant="primary"
                            size="lg"
                            icon={Rocket}
                            onClick={onComplete}
                        >
                            {t('onboarding.getStarted')}
                        </Button>
                    ) : (
                        <Button
                            variant="primary"
                            iconRight={ArrowRight}
                            onClick={onNext}
                        >
                            {t('onboarding.next')}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default OnboardingStep;
export type { OnboardingStepProps };
