import { useCallback, useState } from 'react';
import { RefreshCw, Download, RotateCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';
import useUpdates from '../../hooks/useUpdates';
import { useI18n } from '../../i18n';

function UpdatesSection() {
    const { t } = useI18n();
    const { status, currentVersion, error, clearError, check, download, install } = useUpdates();
    const [confirmOpen, setConfirmOpen] = useState(false);

    const handleCheck = useCallback(() => {
        void check();
    }, [check]);

    const handleDownload = useCallback(() => {
        void download();
    }, [download]);

    const handleInstall = useCallback(() => {
        setConfirmOpen(false);
        void install();
    }, [install]);

    const busy = status.kind === 'checking' || status.kind === 'downloading';
    const percent = Math.round(status.percent ?? 0);

    return (
        <Card
            header={
                <div className="settings-section__header">
                    <RefreshCw size={18} strokeWidth={1.5} className="settings-section__icon" />
                    <span className="settings-section__title">{t('settings.updates.title')}</span>
                </div>
            }
        >
            <div className="settings-updates">
                <div className="settings-about-grid">
                    <span className="settings-about-grid__label">{t('settings.updates.currentVersion')}</span>
                    <span className="settings-about-grid__value">{currentVersion || '...'}</span>
                </div>

                {error && (
                    <div className="settings-note settings-note--warning" role="alert">
                        <AlertTriangle size={14} strokeWidth={1.5} className="settings-note__icon" />
                        <span className="settings-note__text">
                            {t('settings.updates.errorBanner', { message: error })}
                        </span>
                        <Button variant="ghost" size="sm" onClick={clearError}>
                            {t('common.dismiss')}
                        </Button>
                    </div>
                )}

                {status.kind === 'disabled' && (
                    <p className="settings-updates__hint">
                        {t('settings.updates.disabledHint')}
                    </p>
                )}
                {status.kind === 'checking' && (
                    <p className="settings-updates__status">{t('settings.updates.checking')}</p>
                )}
                {status.kind === 'not-available' && (
                    <p className="settings-updates__status">
                        <CheckCircle2 size={16} strokeWidth={1.5} /> {t('settings.updates.latest')}
                    </p>
                )}
                {status.kind === 'available' && (
                    <p className="settings-updates__status">
                        {t('settings.updates.available', { version: status.version ?? '' })}
                    </p>
                )}
                {status.kind === 'downloading' && (
                    <div
                        className="settings-updates__progress"
                        role="progressbar"
                        aria-valuenow={percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                    >
                        <div
                            className="settings-updates__progress-bar"
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                )}
                {status.kind === 'downloaded' && (
                    <p className="settings-updates__status">
                        {t('settings.updates.ready', { version: status.version ?? '' })}
                    </p>
                )}
                {status.kind === 'error' && (
                    <p className="settings-updates__status settings-updates__status--error">
                        <AlertTriangle size={16} strokeWidth={1.5} /> {status.error}
                    </p>
                )}

                <div className="settings-updates__actions">
                    <Button variant="secondary" onClick={handleCheck} disabled={busy}>
                        <RefreshCw size={16} strokeWidth={1.5} /> {t('settings.updates.checkNow')}
                    </Button>
                    {status.kind === 'available' && (
                        <Button variant="primary" onClick={handleDownload}>
                            <Download size={16} strokeWidth={1.5} /> {t('settings.updates.download')}
                        </Button>
                    )}
                    {status.kind === 'downloaded' && (
                        <Button variant="primary" onClick={() => setConfirmOpen(true)}>
                            <RotateCw size={16} strokeWidth={1.5} /> {t('settings.updates.restartToInstall')}
                        </Button>
                    )}
                </div>
            </div>

            <ConfirmDialog
                isOpen={confirmOpen}
                title={t('settings.updates.confirmTitle')}
                message={t('settings.updates.confirmMessage')}
                confirmLabel={t('settings.updates.confirmRestart')}
                cancelLabel={t('settings.updates.confirmLater')}
                onConfirm={handleInstall}
                onCancel={() => setConfirmOpen(false)}
            />
        </Card>
    );
}

export default UpdatesSection;
