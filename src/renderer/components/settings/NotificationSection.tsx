import { useCallback, useId } from 'react';
import { BellRing, Info } from 'lucide-react';
import Card from '../common/Card';
import { useI18n } from '../../i18n';

interface NotificationSectionProps {
    notificationsEnabled: boolean;
    soundEnabled: boolean;
    onNotificationsChange: (enabled: boolean) => void;
    onSoundChange: (enabled: boolean) => void;
}

function NotificationSection({
    notificationsEnabled,
    soundEnabled,
    onNotificationsChange,
    onSoundChange,
}: NotificationSectionProps) {
    const { t } = useI18n();
    const notifId = useId();
    const soundId = useId();

    const handleNotifChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onNotificationsChange(e.target.checked);
    }, [onNotificationsChange]);

    const handleSoundChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onSoundChange(e.target.checked);
    }, [onSoundChange]);

    return (
        <Card
            header={
                <div className="settings-section__header">
                    <BellRing size={18} strokeWidth={1.5} className="settings-section__icon" />
                    <span className="settings-section__title">{t('settings.notifications.title')}</span>
                </div>
            }
        >
            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={notifId} className="settings-field__label">{t('settings.notifications.desktop')}</label>
                    <span className="settings-field__hint">{t('settings.notifications.desktopHint')}</span>
                </div>
                <div className="settings-field__control">
                    <label className="settings-toggle">
                        <input
                            id={notifId}
                            type="checkbox"
                            className="settings-toggle__input"
                            checked={notificationsEnabled}
                            onChange={handleNotifChange}
                        />
                        <span className="settings-toggle__track" />
                    </label>
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={soundId} className="settings-field__label">{t('settings.notifications.sound')}</label>
                    <span className="settings-field__hint">{t('settings.notifications.soundHint')}</span>
                </div>
                <div className="settings-field__control">
                    <label className="settings-toggle">
                        <input
                            id={soundId}
                            type="checkbox"
                            className="settings-toggle__input"
                            checked={soundEnabled}
                            onChange={handleSoundChange}
                        />
                        <span className="settings-toggle__track" />
                    </label>
                </div>
            </div>

            <div className="settings-note">
                <Info size={14} strokeWidth={1.5} className="settings-note__icon" />
                <span className="settings-note__text">
                    {t('settings.notifications.note')}
                </span>
            </div>
        </Card>
    );
}

export default NotificationSection;
