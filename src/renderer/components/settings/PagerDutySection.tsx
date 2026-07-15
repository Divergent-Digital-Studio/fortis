import { useCallback, useEffect, useId, useState } from 'react';
import { BellRing, Info, Send, Check, X, Loader2 } from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Select from '../common/Select';
import type { ThreatLevel } from '@shared/types/analysis';
import type { PagerDutyState } from '@shared/types/m5';
import { useI18n } from '../../i18n';

type TestStatus = 'idle' | 'testing' | 'ok' | 'fail';

function PagerDutySection() {
    const { t } = useI18n();
    const enableId = useId();
    const keyId = useId();

    const severityOptions: ReadonlyArray<{ value: ThreatLevel; label: string }> = [
        { value: 'warning', label: t('settings.severity.warning') },
        { value: 'danger', label: t('settings.severity.danger') },
        { value: 'critical', label: t('settings.severity.critical') },
    ];

    const [state, setState] = useState<PagerDutyState>({ enabled: false, configured: false, severityFloor: 'critical' });
    const [keyDraft, setKeyDraft] = useState('');
    const [testStatus, setTestStatus] = useState<TestStatus>('idle');

    useEffect(() => {
        let active = true;
        window.fortis
            .getPagerDutyState()
            .then((s) => {
                if (active) setState(s);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, []);

    const persist = useCallback(
        async (next: { enabled?: boolean; routingKey?: string; severityFloor?: string }) => {
            const result = await window.fortis.setPagerDuty({
                enabled: next.enabled ?? state.enabled,
                severityFloor: next.severityFloor ?? state.severityFloor,
                ...(next.routingKey !== undefined ? { routingKey: next.routingKey } : {}),
            });
            setState(result);
        },
        [state.enabled, state.severityFloor],
    );

    const handleEnabledChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const key = keyDraft.trim();
            void persist({ enabled: e.target.checked, ...(key.length > 0 ? { routingKey: key } : {}) });
        },
        [persist, keyDraft],
    );

    const handleKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setKeyDraft(e.target.value);
        setTestStatus('idle');
    }, []);

    const handleSeverityChange = useCallback(
        (value: ThreatLevel) => {
            void persist({ severityFloor: value });
        },
        [persist],
    );

    const handleSaveKey = useCallback(() => {
        const key = keyDraft.trim();
        if (key.length === 0) return;
        void persist({ routingKey: key }).then(() => setKeyDraft(''));
    }, [persist, keyDraft]);

    const handleTest = useCallback(async () => {
        const key = keyDraft.trim();
        if (key.length === 0) return;
        setTestStatus('testing');
        try {
            const ok = await window.fortis.testPagerDuty(key);
            setTestStatus(ok ? 'ok' : 'fail');
        } catch {
            setTestStatus('fail');
        }
    }, [keyDraft]);

    const keyEmpty = keyDraft.trim().length === 0;

    return (
        <Card
            header={
                <div className="settings-section__header">
                    <BellRing size={18} strokeWidth={1.5} className="settings-section__icon" />
                    <span className="settings-section__title">{t('settings.pagerduty.title')}</span>
                </div>
            }
        >
            <div className="settings-field settings-field--stacked-messages">
                <div className="settings-field__row">
                    <div className="settings-field__label-group">
                        <label htmlFor={keyId} className="settings-field__label">{t('settings.pagerduty.routingKey')}</label>
                        <span className="settings-field__hint">
                            {state.configured ? t('settings.pagerduty.keyConfigured') : t('settings.pagerduty.keyHint')}
                        </span>
                    </div>
                    <div className="settings-field__control">
                        <div className="settings-input-group">
                            <input
                                id={keyId}
                                type="password"
                                className="settings-input"
                                placeholder={state.configured ? t('settings.pagerduty.replaceKey') : t('settings.pagerduty.setKey')}
                                value={keyDraft}
                                onChange={handleKeyChange}
                                autoComplete="off"
                                spellCheck={false}
                            />
                            <Button variant="secondary" size="sm" onClick={handleSaveKey} disabled={keyEmpty}>
                                {t('common.save')}
                            </Button>
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
                                disabled={keyEmpty || testStatus === 'testing'}
                            >
                                {t('settings.test')}
                            </Button>
                        </div>
                    </div>
                </div>
                {testStatus === 'ok' && (
                    <p className="settings-field__success settings-field__message">{t('settings.pagerduty.testOk')}</p>
                )}
                {testStatus === 'fail' && (
                    <p className="settings-field__error settings-field__message">{t('settings.pagerduty.testFail')}</p>
                )}
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label className="settings-field__label">{t('settings.severityFloor')}</label>
                    <span className="settings-field__hint">{t('settings.pagerduty.severityHint')}</span>
                </div>
                <div className="settings-field__control">
                    <Select
                        value={state.severityFloor}
                        options={severityOptions}
                        onChange={handleSeverityChange}
                        ariaLabel={t('settings.pagerduty.severityAria')}
                    />
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={enableId} className="settings-field__label">{t('settings.pagerduty.enable')}</label>
                    <span className="settings-field__hint">{t('settings.pagerduty.enableHint')}</span>
                </div>
                <div className="settings-field__control">
                    <label className="settings-toggle">
                        <input
                            id={enableId}
                            type="checkbox"
                            className="settings-toggle__input"
                            checked={state.enabled}
                            onChange={handleEnabledChange}
                            disabled={!state.configured && keyEmpty}
                        />
                        <span className="settings-toggle__track" />
                    </label>
                </div>
            </div>

            <div className="settings-note">
                <Info size={14} strokeWidth={1.5} className="settings-note__icon" />
                <span className="settings-note__text">
                    {t('settings.pagerduty.note')}
                </span>
            </div>
        </Card>
    );
}

export default PagerDutySection;
