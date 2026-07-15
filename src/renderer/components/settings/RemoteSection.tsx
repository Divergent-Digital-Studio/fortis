import { useCallback, useId, useMemo, useState } from 'react';
import { ServerCog, Info, Loader2, Check, Save, ShieldAlert, Copy } from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Select from '../common/Select';
import useRemote from '../../hooks/useRemote';
import useSettings from '../../hooks/useSettings';
import { isValidBindHost, isPubliclyBound } from '@shared/utils/bind-host';
import { useI18n } from '../../i18n';

type SaveStatus = 'idle' | 'saving' | 'saved';
type BindMode = 'loopback' | 'lan' | 'custom';

const LOOPBACK = '127.0.0.1';
const WILDCARD = '0.0.0.0';

function bindModeOf(host: string): BindMode {
    if (host === LOOPBACK) return 'loopback';
    if (host === WILDCARD) return 'lan';
    return 'custom';
}

function RemoteSection() {
    const { t } = useI18n();
    const { serverState, lanAddress, setEnabled } = useRemote();
    const { settings, isLoaded, updateSettings } = useSettings();

    const enableId = useId();
    const tokenId = useId();
    const bindId = useId();
    const hostId = useId();
    const portId = useId();
    const tlsId = useId();
    const certId = useId();
    const keyId = useId();

    const [tokenDraft, setTokenDraft] = useState('');
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [copied, setCopied] = useState(false);

    const bindOptions: ReadonlyArray<{ value: BindMode; label: string }> = [
        { value: 'loopback', label: t('settings.remote.bindLoopback') },
        { value: 'lan', label: t('settings.remote.bindLan') },
        { value: 'custom', label: t('settings.remote.bindCustom') },
    ];

    const host = settings.remoteServerHost;
    const port = settings.remoteServerPort;
    const bindMode = bindModeOf(host);
    const tlsReady = settings.remoteServerCertPath.length > 0 && settings.remoteServerKeyPath.length > 0;
    const tlsOn = settings.remoteServerTlsEnabled;
    const exposed = isPubliclyBound(host);
    const hostValid = isValidBindHost(host);

    // What an agent on another machine should dial. 0.0.0.0 is not routable.
    const connectHost = host === WILDCARD ? lanAddress || '<this-host>' : host;
    const connectUrl = `${tlsOn ? 'wss' : 'ws'}://${connectHost}:${port}`;

    const handleTokenChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setTokenDraft(e.target.value);
        setSaveStatus('idle');
    }, []);

    const handleEnabledChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const token = tokenDraft.trim();
            void setEnabled(e.target.checked, token.length > 0 ? token : undefined);
        },
        [setEnabled, tokenDraft],
    );

    const handleSaveToken = useCallback(async () => {
        const token = tokenDraft.trim();
        if (token.length === 0) return;
        setSaveStatus('saving');
        try {
            await setEnabled(serverState.enabled, token);
            setSaveStatus('saved');
            setTokenDraft('');
        } catch {
            setSaveStatus('idle');
        }
    }, [setEnabled, serverState.enabled, tokenDraft]);

    const handleBindModeChange = useCallback(
        (mode: BindMode) => {
            if (mode === 'loopback') void updateSettings({ remoteServerHost: LOOPBACK });
            else if (mode === 'lan') void updateSettings({ remoteServerHost: WILDCARD });
            else void updateSettings({ remoteServerHost: lanAddress || LOOPBACK });
        },
        [updateSettings, lanAddress],
    );

    const handleHostChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const next = e.target.value.trim();
            if (isValidBindHost(next)) void updateSettings({ remoteServerHost: next });
        },
        [updateSettings],
    );

    const handlePortChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const next = Number.parseInt(e.target.value, 10);
            if (Number.isInteger(next) && next >= 1024 && next <= 65535) {
                void updateSettings({ remoteServerPort: next });
            }
        },
        [updateSettings],
    );

    const handleTlsChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            void updateSettings({ remoteServerTlsEnabled: e.target.checked });
        },
        [updateSettings],
    );

    const handleCopyUrl = useCallback(() => {
        void navigator.clipboard.writeText(connectUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }, [connectUrl]);

    const warning = useMemo(() => {
        if (!hostValid) return t('settings.remote.warnInvalidHost');
        if (tlsOn && !tlsReady) return t('settings.remote.warnTlsNotReady');
        if (exposed && !tlsOn) return t('settings.remote.warnExposed');
        return null;
    }, [hostValid, tlsOn, tlsReady, exposed, t]);

    // The path/port inputs are uncontrolled (defaultValue), so they must not
    // mount before the persisted settings arrive or they render stale blanks.
    if (!isLoaded) return null;

    return (
        <Card
            header={
                <div className="settings-section__header">
                    <ServerCog size={18} strokeWidth={1.5} className="settings-section__icon" />
                    <span className="settings-section__title">{t('settings.remote.title')}</span>
                </div>
            }
        >
            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={enableId} className="settings-field__label">{t('settings.remote.enable')}</label>
                    <span className="settings-field__hint">{t('settings.remote.enableHint')}</span>
                </div>
                <div className="settings-field__control">
                    <label className="settings-toggle">
                        <input
                            id={enableId}
                            type="checkbox"
                            className="settings-toggle__input"
                            checked={serverState.enabled}
                            onChange={handleEnabledChange}
                        />
                        <span className="settings-toggle__track" />
                    </label>
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label id={bindId} className="settings-field__label">{t('settings.remote.whoCanConnect')}</label>
                    <span className="settings-field__hint">
                        {t('settings.remote.whoCanConnectHint')}
                    </span>
                </div>
                <div className="settings-field__control">
                    <Select
                        value={bindMode}
                        options={bindOptions}
                        onChange={handleBindModeChange}
                        ariaLabelledBy={bindId}
                    />
                </div>
            </div>

            {bindMode === 'custom' && (
                <div className="settings-field">
                    <div className="settings-field__label-group">
                        <label htmlFor={hostId} className="settings-field__label">{t('settings.remote.bindAddress')}</label>
                        <span className="settings-field__hint">{t('settings.remote.bindAddressHint')}</span>
                    </div>
                    <div className="settings-field__control">
                        <input
                            id={hostId}
                            type="text"
                            className="settings-input"
                            defaultValue={host}
                            onBlur={handleHostChange}
                            autoComplete="off"
                            spellCheck={false}
                            aria-invalid={!hostValid}
                        />
                    </div>
                </div>
            )}

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={portId} className="settings-field__label">{t('settings.remote.port')}</label>
                    <span className="settings-field__hint">{t('settings.remote.portHint')}</span>
                </div>
                <div className="settings-field__control">
                    <input
                        id={portId}
                        type="number"
                        min={1024}
                        max={65535}
                        className="settings-input"
                        defaultValue={port}
                        onBlur={handlePortChange}
                    />
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={tlsId} className="settings-field__label">{t('settings.remote.tls')}</label>
                    <span className="settings-field__hint">
                        {tlsReady ? t('settings.remote.tlsReadyHint') : t('settings.remote.tlsNotReadyHint')}
                    </span>
                </div>
                <div className="settings-field__control">
                    <label className="settings-toggle">
                        <input
                            id={tlsId}
                            type="checkbox"
                            className="settings-toggle__input"
                            checked={tlsOn}
                            disabled={!tlsReady && !tlsOn}
                            onChange={handleTlsChange}
                        />
                        <span className="settings-toggle__track" />
                    </label>
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={certId} className="settings-field__label">{t('settings.remote.certPath')}</label>
                    <span className="settings-field__hint">{t('settings.remote.certPathHint')}</span>
                </div>
                <div className="settings-field__control">
                    <input
                        id={certId}
                        type="text"
                        className="settings-input"
                        placeholder="/path/to/cert.pem"
                        defaultValue={settings.remoteServerCertPath}
                        onBlur={(e) => void updateSettings({ remoteServerCertPath: e.target.value.trim() })}
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={keyId} className="settings-field__label">{t('settings.remote.keyPath')}</label>
                    <span className="settings-field__hint">{t('settings.remote.keyPathHint')}</span>
                </div>
                <div className="settings-field__control">
                    <input
                        id={keyId}
                        type="text"
                        className="settings-input"
                        placeholder="/path/to/key.pem"
                        defaultValue={settings.remoteServerKeyPath}
                        onBlur={(e) => void updateSettings({ remoteServerKeyPath: e.target.value.trim() })}
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__row">
                    <div className="settings-field__label-group">
                        <label htmlFor={tokenId} className="settings-field__label">{t('settings.remote.token')}</label>
                        <span className="settings-field__hint">{t('settings.remote.tokenHint')}</span>
                    </div>
                    <div className="settings-field__control">
                        <div className="settings-input-group">
                            <input
                                id={tokenId}
                                type="password"
                                className="settings-input"
                                placeholder={t('settings.remote.tokenPlaceholder')}
                                value={tokenDraft}
                                onChange={handleTokenChange}
                                autoComplete="off"
                                spellCheck={false}
                            />
                            <Button
                                variant="secondary"
                                size="sm"
                                icon={saveStatus === 'saving' ? Loader2 : saveStatus === 'saved' ? Check : Save}
                                onClick={handleSaveToken}
                                disabled={saveStatus === 'saving' || tokenDraft.trim().length === 0}
                            >
                                {t('common.save')}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {warning && (
                <div className="settings-note settings-note--warning" role="alert">
                    <ShieldAlert size={14} strokeWidth={1.5} className="settings-note__icon" />
                    <span className="settings-note__text">{warning}</span>
                </div>
            )}

            <div className="settings-note">
                <Info size={14} strokeWidth={1.5} className="settings-note__icon" />
                <span className="settings-note__text">
                    {t('settings.remote.connectNotePrefix')}{' '}
                    <span className="settings-note__code">{connectUrl}</span>{' '}
                    {t('settings.remote.connectNoteSuffix')}
                </span>
                <Button
                    variant="secondary"
                    size="sm"
                    icon={copied ? Check : Copy}
                    onClick={handleCopyUrl}
                    aria-label={t('settings.remote.copyAria')}
                >
                    {copied ? t('settings.remote.copied') : t('settings.remote.copy')}
                </Button>
            </div>
        </Card>
    );
}

export default RemoteSection;
