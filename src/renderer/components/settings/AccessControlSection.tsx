import { useCallback, useId } from 'react';
import { ShieldCheck, Info } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import useSettings from '../../hooks/useSettings';
import useAdmin from '../../hooks/useAdmin';
import { useI18n } from '../../i18n';

function AccessControlSection() {
    const { t } = useI18n();
    const enableId = useId();
    const { settings, updateSettings } = useSettings();
    const { session } = useAdmin();

    const handleEnabledChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            void updateSettings({ rbacEnabled: e.target.checked }, session?.token);
        },
        [updateSettings, session],
    );

    return (
        <Card
            header={
                <div className="settings-section__header">
                    <ShieldCheck size={18} strokeWidth={1.5} className="settings-section__icon" />
                    <span className="settings-section__title">{t('settings.accessControl.title')}</span>
                </div>
            }
        >
            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label className="settings-field__label">{t('settings.accessControl.signedInAs')}</label>
                    <span className="settings-field__hint">
                        {session ? t('settings.accessControl.activeSession') : t('settings.accessControl.noSession')}
                    </span>
                </div>
                <div className="settings-field__control">
                    {session ? (
                        <Badge variant="safe">
                            {session.username} · {session.role}
                        </Badge>
                    ) : (
                        <Badge variant="neutral">{t('settings.accessControl.notSignedIn')}</Badge>
                    )}
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={enableId} className="settings-field__label">{t('settings.accessControl.enable')}</label>
                    <span className="settings-field__hint">{t('settings.accessControl.enableHint')}</span>
                </div>
                <div className="settings-field__control">
                    <label className="settings-toggle">
                        <input
                            id={enableId}
                            type="checkbox"
                            className="settings-toggle__input"
                            checked={settings.rbacEnabled}
                            onChange={handleEnabledChange}
                        />
                        <span className="settings-toggle__track" />
                    </label>
                </div>
            </div>

            <div className="settings-note">
                <Info size={14} strokeWidth={1.5} className="settings-note__icon" />
                <span className="settings-note__text">
                    {t('settings.accessControl.note')}
                </span>
            </div>
        </Card>
    );
}

export default AccessControlSection;
