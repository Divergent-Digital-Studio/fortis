import { useCallback, useId, useState } from 'react';
import { Share2, Info, Send, Check, X, Loader2 } from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Select from '../common/Select';
import useSettings from '../../hooks/useSettings';
import useAdmin from '../../hooks/useAdmin';
import useEnterprise from '../../hooks/useEnterprise';
import type { ThreatLevel } from '@shared/types/analysis';
import type { SiemVendor } from '@shared/types/m6';
import { useI18n } from '../../i18n';

type TestStatus = 'idle' | 'testing' | 'ok' | 'fail';

const VENDOR_OPTIONS: ReadonlyArray<{ value: SiemVendor; label: string }> = [
    { value: 'splunk', label: 'Splunk' },
    { value: 'elastic', label: 'Elastic' },
    { value: 'datadog', label: 'Datadog' },
];

function SiemSection() {
    const { t } = useI18n();
    const enableId = useId();
    const endpointId = useId();
    const tokenId = useId();

    const { settings, updateSettings } = useSettings();
    const { session } = useAdmin();
    const { siemState, error, dismissError } = useEnterprise();

    const [tokenDraft, setTokenDraft] = useState('');
    const [testStatus, setTestStatus] = useState<TestStatus>('idle');

    const severityOptions: ReadonlyArray<{ value: ThreatLevel; label: string }> = [
        { value: 'warning', label: t('settings.severity.warning') },
        { value: 'danger', label: t('settings.severity.danger') },
        { value: 'critical', label: t('settings.severity.critical') },
    ];

    const persist = useCallback(
        async (next: { enabled?: boolean; vendor?: SiemVendor; endpoint?: string; severityFloor?: ThreatLevel; token?: string }) => {
            const token = session?.token ?? '';
            await window.fortis.setSiem(token, {
                enabled: next.enabled ?? settings.siemEnabled,
                vendor: next.vendor ?? settings.siemVendor,
                endpoint: next.endpoint ?? settings.siemEndpoint,
                severityFloor: next.severityFloor ?? settings.siemSeverityFloor,
                ...(next.token !== undefined ? { token: next.token } : {}),
            });
        },
        [session, settings.siemEnabled, settings.siemVendor, settings.siemEndpoint, settings.siemSeverityFloor],
    );

    const handleVendorChange = useCallback(
        (vendor: SiemVendor) => {
            updateSettings({ siemVendor: vendor });
            setTestStatus('idle');
            void persist({ vendor });
        },
        [persist, updateSettings],
    );

    const handleEndpointChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateSettings({ siemEndpoint: e.target.value });
            setTestStatus('idle');
        },
        [updateSettings],
    );

    const handleEndpointBlur = useCallback(() => {
        void persist({ endpoint: settings.siemEndpoint });
    }, [persist, settings.siemEndpoint]);

    const handleSeverityChange = useCallback(
        (severityFloor: ThreatLevel) => {
            updateSettings({ siemSeverityFloor: severityFloor });
            void persist({ severityFloor });
        },
        [persist, updateSettings],
    );

    const handleEnabledChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateSettings({ siemEnabled: e.target.checked });
            const token = tokenDraft.trim();
            void persist({ enabled: e.target.checked, ...(token.length > 0 ? { token } : {}) });
        },
        [persist, updateSettings, tokenDraft],
    );

    const handleTest = useCallback(async () => {
        const token = session?.token ?? '';
        const tok = tokenDraft.trim();
        if (tok.length === 0 || settings.siemEndpoint.trim().length === 0) return;
        setTestStatus('testing');
        try {
            const ok = await window.fortis.testSiem(token, {
                vendor: settings.siemVendor,
                endpoint: settings.siemEndpoint,
                token: tok,
            });
            setTestStatus(ok ? 'ok' : 'fail');
            if (ok) void persist({ token: tok });
        } catch {
            setTestStatus('fail');
        }
    }, [session, tokenDraft, settings.siemEndpoint, settings.siemVendor, persist]);

    const tokenEmpty = tokenDraft.trim().length === 0;

    return (
        <Card
            header={
                <div className="settings-section__header">
                    <Share2 size={18} strokeWidth={1.5} className="settings-section__icon" />
                    <span className="settings-section__title">{t('settings.siem.title')}</span>
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
                    <label className="settings-field__label">{t('settings.siem.verification')}</label>
                    <span className="settings-field__hint">{t('settings.siem.verificationHint')}</span>
                </div>
                <div className="settings-field__control">
                    <Badge variant={siemState.verified ? 'safe' : 'neutral'}>
                        {siemState.verified ? t('settings.siem.verified') : t('settings.siem.unverified')}
                    </Badge>
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label className="settings-field__label">{t('settings.siem.vendor')}</label>
                    <span className="settings-field__hint">{t('settings.siem.vendorHint')}</span>
                </div>
                <div className="settings-field__control">
                    <Select
                        value={settings.siemVendor}
                        options={VENDOR_OPTIONS}
                        onChange={handleVendorChange}
                        ariaLabel={t('settings.siem.vendorAria')}
                    />
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={endpointId} className="settings-field__label">{t('settings.siem.endpoint')}</label>
                    <span className="settings-field__hint">{t('settings.siem.endpointHint')}</span>
                </div>
                <div className="settings-field__control">
                    <input
                        id={endpointId}
                        type="url"
                        className="settings-input"
                        placeholder="https://collector.example.com"
                        value={settings.siemEndpoint}
                        onChange={handleEndpointChange}
                        onBlur={handleEndpointBlur}
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>
            </div>

            <div className="settings-field settings-field--stacked-messages">
                <div className="settings-field__row">
                    <div className="settings-field__label-group">
                        <label htmlFor={tokenId} className="settings-field__label">{t('settings.siem.token')}</label>
                        <span className="settings-field__hint">{t('settings.siem.tokenHint')}</span>
                    </div>
                    <div className="settings-field__control">
                        <div className="settings-input-group">
                            <input
                                id={tokenId}
                                type="password"
                                className="settings-input"
                                placeholder={t('settings.siem.tokenPlaceholder')}
                                value={tokenDraft}
                                onChange={(e) => {
                                    setTokenDraft(e.target.value);
                                    setTestStatus('idle');
                                }}
                                autoComplete="off"
                                spellCheck={false}
                            />
                            <Button
                                variant="secondary"
                                size="sm"
                                icon={
                                    testStatus === 'testing'
                                        ? Loader2
                                        : testStatus === 'ok'
                                            ? Check
                                            : testStatus === 'fail'
                                                ? X
                                                : Send
                                }
                                onClick={handleTest}
                                disabled={tokenEmpty || testStatus === 'testing' || settings.siemEndpoint.trim().length === 0}
                            >
                                {t('settings.test')}
                            </Button>
                        </div>
                    </div>
                </div>
                {testStatus === 'ok' && (
                    <p className="settings-field__success settings-field__message">{t('settings.siem.testOk')}</p>
                )}
                {testStatus === 'fail' && (
                    <p className="settings-field__error settings-field__message">{t('settings.siem.testFail')}</p>
                )}
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label className="settings-field__label">{t('settings.severityFloor')}</label>
                    <span className="settings-field__hint">{t('settings.siem.severityHint')}</span>
                </div>
                <div className="settings-field__control">
                    <Select
                        value={settings.siemSeverityFloor}
                        options={severityOptions}
                        onChange={handleSeverityChange}
                        ariaLabel={t('settings.siem.severityAria')}
                    />
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={enableId} className="settings-field__label">{t('settings.siem.enable')}</label>
                    <span className="settings-field__hint">{t('settings.siem.enableHint')}</span>
                </div>
                <div className="settings-field__control">
                    <label className="settings-toggle">
                        <input
                            id={enableId}
                            type="checkbox"
                            className="settings-toggle__input"
                            checked={settings.siemEnabled}
                            onChange={handleEnabledChange}
                            disabled={!siemState.configured && tokenEmpty}
                        />
                        <span className="settings-toggle__track" />
                    </label>
                </div>
            </div>

            <div className="settings-note">
                <Info size={14} strokeWidth={1.5} className="settings-note__icon" />
                <span className="settings-note__text">
                    {t('settings.siem.note')}
                </span>
            </div>
        </Card>
    );
}

export default SiemSection;
