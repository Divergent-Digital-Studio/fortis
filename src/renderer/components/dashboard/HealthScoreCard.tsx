import { memo, useMemo } from 'react';
import { HeartPulse } from 'lucide-react';
import Card from '../common/Card';
import useAIStatus from '../../hooks/useAIStatus';
import { useI18n } from '../../i18n';
import '../../styles/components/health-score.css';

type ScoreLevel = 'healthy' | 'caution' | 'critical';

function getScoreLevel(score: number): ScoreLevel {
    if (score >= 80) return 'healthy';
    if (score >= 50) return 'caution';
    return 'critical';
}

const CIRCLE_RADIUS = 54;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

const HealthScoreCard = memo(function HealthScoreCard() {
    const { t } = useI18n();
    const { lastAnalysis, loading } = useAIStatus();

    const score = lastAnalysis?.healthScore ?? null;
    const hasScore = score !== null;
    const displayScore = hasScore ? Math.round(score) : null;

    const level = useMemo<ScoreLevel | null>(() => {
        if (displayScore === null) return null;
        return getScoreLevel(displayScore);
    }, [displayScore]);

    const strokeDashoffset = useMemo(() => {
        if (displayScore === null) return CIRCLE_CIRCUMFERENCE;
        const progress = displayScore / 100;
        return CIRCLE_CIRCUMFERENCE * (1 - progress);
    }, [displayScore]);

    const gaugeModifier = level ? `health-score__gauge--${level}` : '';
    const pulseModifier = level ? `health-score__ring--${level}` : '';

    return (
        <Card
            header={t('overview.health.title')}
            headerActions={<HeartPulse size={16} strokeWidth={1.5} />}
            className="overview__chart-card"
        >
            <div className="health-score">
                <div className={`health-score__gauge ${gaugeModifier}`}>
                    <svg
                        className="health-score__svg"
                        viewBox="0 0 120 120"
                        aria-hidden="true"
                    >
                        <circle
                            className="health-score__track"
                            cx="60"
                            cy="60"
                            r={CIRCLE_RADIUS}
                            fill="none"
                            strokeWidth="8"
                        />
                        {hasScore && (
                            <circle
                                className={`health-score__ring ${pulseModifier}`}
                                cx="60"
                                cy="60"
                                r={CIRCLE_RADIUS}
                                fill="none"
                                strokeWidth="8"
                                strokeLinecap="round"
                                strokeDasharray={CIRCLE_CIRCUMFERENCE}
                                strokeDashoffset={strokeDashoffset}
                                transform="rotate(-90 60 60)"
                            />
                        )}
                    </svg>
                    <div className="health-score__value-wrap">
                        {loading ? (
                            <span className="health-score__loading">...</span>
                        ) : hasScore ? (
                            <div className="health-score__value-stack">
                                <span className="health-score__number">
                                    {displayScore}
                                </span>
                                <span className="health-score__unit">{t('overview.health.outOf')}</span>
                            </div>
                        ) : (
                            <span className="health-score__na">{t('overview.health.na')}</span>
                        )}
                    </div>
                </div>

                <div className="health-score__meta">
                    {level && (
                        <span
                            className={`health-score__badge health-score__badge--${level}`}
                        >
                            {t(`overview.health.level.${level}`)}
                        </span>
                    )}
                    {lastAnalysis?.summary && (
                        <p className="health-score__summary">
                            {lastAnalysis.summary}
                        </p>
                    )}
                    {!hasScore && !loading && (
                        <p className="health-score__hint">
                            {t('overview.health.hint')}
                        </p>
                    )}
                </div>
            </div>
        </Card>
    );
});

export default HealthScoreCard;
