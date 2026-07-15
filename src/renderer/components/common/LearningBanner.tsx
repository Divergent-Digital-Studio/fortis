import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { BookOpen, X } from 'lucide-react';
import type { LearningStatusPayload } from '@shared/types/ipc';
import { useI18n } from '../../i18n';
import '../../styles/components/learning-banner.css';

const LEARNING_PERIOD_DAYS = 7;

function formatActivationDate(daysRemaining: number): string {
    const target = new Date();
    target.setDate(target.getDate() + daysRemaining);
    return target.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

const LearningBanner = memo(function LearningBanner() {
    const { t } = useI18n();
    const [learningStatus, setLearningStatus] = useState<LearningStatusPayload | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const cleanupRef = useRef<(() => void) | null>(null);

    const fetchLearningStatus = useCallback(async () => {
        try {
            const tierInfo = await window.fortis.getTierInfo();
            if (tierInfo.isLearningPeriod) {
                setLearningStatus({
                    isLearningPeriod: true,
                    daysRemaining: tierInfo.learningDaysRemaining,
                    complete: false,
                    baselineCount: 0,
                });
            } else {
                setLearningStatus(null);
            }
        } catch {
            setLearningStatus(null);
        }
    }, []);

    useEffect(() => {
        fetchLearningStatus();

        const unsubLearning = window.fortis.onLearningStatus((status) => {
            if (status.complete || !status.isLearningPeriod) {
                setLearningStatus(null);
            } else {
                setLearningStatus(status);
            }
        });

        cleanupRef.current = unsubLearning;

        return () => {
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }
        };
    }, [fetchLearningStatus]);

    if (!learningStatus || !learningStatus.isLearningPeriod || dismissed) {
        return null;
    }

    const daysRemaining = learningStatus.daysRemaining;
    const daysElapsed = LEARNING_PERIOD_DAYS - daysRemaining;
    const progressPercent = Math.min(100, Math.max(0, (daysElapsed / LEARNING_PERIOD_DAYS) * 100));
    const activationDate = formatActivationDate(daysRemaining);

    return (
        <div className="learning-banner" role="status" aria-live="polite">
            <div className="learning-banner__icon">
                <BookOpen size={16} strokeWidth={1.5} />
            </div>

            <div className="learning-banner__content">
                <p className="learning-banner__message">
                    {t('common.learning.message')} <strong>{activationDate}</strong>.
                </p>

                <div className="learning-banner__progress-container">
                    <div className="learning-banner__progress-bar">
                        <div
                            className="learning-banner__progress-fill"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    <span className="learning-banner__progress-label">
                        {t('common.learning.progress', { elapsed: daysElapsed, total: LEARNING_PERIOD_DAYS })}
                    </span>
                </div>
            </div>

            <button
                className="learning-banner__dismiss"
                onClick={() => setDismissed(true)}
                aria-label={t('common.learning.dismissAria')}
                type="button"
            >
                <X size={14} strokeWidth={1.5} />
            </button>
        </div>
    );
});

export default LearningBanner;
