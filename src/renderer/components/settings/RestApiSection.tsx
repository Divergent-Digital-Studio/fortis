import { useCallback, useId, useState } from 'react';
import { Globe, Info, X } from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import useSettings from '../../hooks/useSettings';
import useAdmin from '../../hooks/useAdmin';
import useEnterprise from '../../hooks/useEnterprise';
import { useI18n } from '../../i18n';

function RestApiSection() {
    const { t } = useI18n();
    const enableId = useId();
    const portId = useId();
    const tokenId = useId();

    const { settings, updateSettings } = useSettings();
    const { session } = useAdmin();
    const { restState, error, dismissError } = useEnterprise();

    const [tokenDraft, setTokenDraft] = useState('');

    const persist = useCallback(
        async (next: { enabled?: boolean; port?: number; token?: string }) => {
            const token = session?.token ?? '';
            const enabled = next.enabled ?? settings.restApiEnabled;
            const port = next.port ?? settings.restApiPort;
            await window.fortis.setRestApi(token, {
                enabled,
                port,
                ...(next.token !== undefined ? { token: next.token } : {}),
            });
        },
        [session, settings.restApiEnabled, settings.restApiPort],
    );

    const handleEnabledChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateSettings({ restApiEnabled: e.target.checked });
            void persist({ enabled: e.target.checked });
        },
        [persist, updateSettings],
    );

    const handlePortChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const port = Number.parseInt(e.target.value, 10);
            if (Number.isNaN(port)) return;
            updateSettings({ restApiPort: port });
            void persist({ port });
        },
        [persist, updateSettings],
    );

    const handleSaveToken = useCallback(() => {
        const token = tokenDraft.trim();
        if (token.length === 0) return;
        void persist({ token }).then(() => setTokenDraft(''));
    }, [persist, tokenDraft]);

    const tokenEmpty = tokenDraft.trim().length === 0;

    return (
        <Card
            header={
                <div className="settings-section__header">
                    <Globe size={18} strokeWidth={1.5} className="settings-section__icon" />
                    <span className="settings-section__title">{t('settings.restApi.title')}</span>
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
                    <label className="settings-field__label">{t('settings.restApi.status')}</label>
                    <span className="settings-field__hint">
                        {restState.host}:{restState.port}
                    </span>
                </div>
                <div className="settings-field__control">
                    <Badge variant={restState.listening ? 'safe' : 'neutral'}>
                        {restState.enabled ? (restState.listening ? t('settings.restApi.listening') : t('settings.restApi.stopped')) : t('common.disabled')}
                    </Badge>
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={portId} className="settings-field__label">{t('settings.restApi.port')}</label>
                    <span className="settings-field__hint">{t('settings.restApi.portHint')}</span>
                </div>
                <div className="settings-field__control">
                    <input
                        id={portId}
                        type="number"
                        className="settings-input"
                        value={settings.restApiPort}
                        onChange={handlePortChange}
                        min={1}
                        max={65535}
                    />
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={tokenId} className="settings-field__label">{t('settings.restApi.bearerToken')}</label>
                    <span className="settings-field__hint">{t('settings.restApi.bearerTokenHint')}</span>
                </div>
                <div className="settings-field__control">
                    <div className="settings-input-group">
                        <input
                            id={tokenId}
                            type="password"
                            className="settings-input"
                            placeholder={t('settings.restApi.tokenPlaceholder')}
                            value={tokenDraft}
                            onChange={(e) => setTokenDraft(e.target.value)}
                            autoComplete="off"
                            spellCheck={false}
                        />
                        <Button variant="secondary" size="sm" onClick={handleSaveToken} disabled={tokenEmpty}>
                            {t('common.save')}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={enableId} className="settings-field__label">{t('settings.restApi.enable')}</label>
                    <span className="settings-field__hint">{t('settings.restApi.enableHint')}</span>
                </div>
                <div className="settings-field__control">
                    <label className="settings-toggle">
                        <input
                            id={enableId}
                            type="checkbox"
                            className="settings-toggle__input"
                            checked={settings.restApiEnabled}
                            onChange={handleEnabledChange}
                        />
                        <span className="settings-toggle__track" />
                    </label>
                </div>
            </div>

            <div className="settings-note">
                <Info size={14} strokeWidth={1.5} className="settings-note__icon" />
                <span className="settings-note__text">
                    {t('settings.restApi.note')}
                </span>
            </div>
        </Card>
    );
}

export default RestApiSection;
