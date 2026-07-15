import { useCallback, useId } from 'react';
import { UserSearch, Info, X } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import EmptyState from '../common/EmptyState';
import useSettings from '../../hooks/useSettings';
import useEnterprise from '../../hooks/useEnterprise';
import { useI18n } from '../../i18n';

function scoreVariant(score: number): 'safe' | 'warning' | 'danger' {
    if (score >= 75) return 'danger';
    if (score >= 40) return 'warning';
    return 'safe';
}

function InsiderThreatSection() {
    const { t } = useI18n();
    const enableId = useId();
    const { settings, updateSettings } = useSettings();
    const { insiderEvents, error, dismissError } = useEnterprise();

    const handleEnabledChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            void updateSettings({ insiderThreatEnabled: e.target.checked });
        },
        [updateSettings],
    );

    return (
        <Card
            header={
                <div className="settings-section__header">
                    <UserSearch size={18} strokeWidth={1.5} className="settings-section__icon" />
                    <span className="settings-section__title">{t('settings.insider.title')}</span>
                </div>
            }
        >
            {error && (
                <div className="settings-field__error settings-field__message" role="alert">
                    <span>{t('settings.enterprise.loadFailed', { message: error })}</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={X}
                        iconOnly
                        aria-label={t('common.dismiss')}
                        onClick={dismissError}
                    />
                </div>
            )}
            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={enableId} className="settings-field__label">{t('settings.insider.enable')}</label>
                    <span className="settings-field__hint">{t('settings.insider.enableHint')}</span>
                </div>
                <div className="settings-field__control">
                    <label className="settings-toggle">
                        <input
                            id={enableId}
                            type="checkbox"
                            className="settings-toggle__input"
                            checked={settings.insiderThreatEnabled}
                            onChange={handleEnabledChange}
                        />
                        <span className="settings-toggle__track" />
                    </label>
                </div>
            </div>

            {insiderEvents.length === 0 ? (
                <EmptyState
                    icon={UserSearch}
                    title={t('settings.insider.emptyTitle')}
                    message={t('settings.insider.emptyMessage')}
                />
            ) : (
                <ul className="remote-events">
                    {insiderEvents.map((e) => (
                        <li key={`${e.ts}-${e.processName}`} className="remote-events__item">
                            <span className="remote-events__agent">{e.processName}</span>
                            <Badge variant={scoreVariant(e.score)}>{e.score}</Badge>
                            <span className="remote-events__summary">{e.factors.join(', ')}</span>
                        </li>
                    ))}
                </ul>
            )}

            <div className="settings-note">
                <Info size={14} strokeWidth={1.5} className="settings-note__icon" />
                <span className="settings-note__text">
                    {t('settings.insider.note')}
                </span>
            </div>
        </Card>
    );
}

export default InsiderThreatSection;
