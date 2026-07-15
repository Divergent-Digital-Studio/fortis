import { useCallback, useEffect, useId, useState } from 'react';
import { ShieldCheck, Info, Send, Check, X, Loader2 } from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import { useI18n } from '../../i18n';

interface DefenseSectionProps {
    defenseEnabled: boolean;
    webhookUrl: string;
    webhookEnabled: boolean;
    onDefenseEnabledChange: (enabled: boolean) => void;
    onWebhookUrlChange: (url: string) => void;
    onWebhookEnabledChange: (enabled: boolean) => void;
}

type TestStatus = 'idle' | 'testing' | 'ok' | 'fail';

function DefenseSection({
    defenseEnabled,
    webhookUrl,
    webhookEnabled,
    onDefenseEnabledChange,
    onWebhookUrlChange,
    onWebhookEnabledChange,
}: DefenseSectionProps) {
    const { t } = useI18n();
    const defenseId = useId();
    const urlId = useId();
    const webhookId = useId();

    const [urlDraft, setUrlDraft] = useState(webhookUrl);
    const [testStatus, setTestStatus] = useState<TestStatus>('idle');

    useEffect(() => {
        setUrlDraft(webhookUrl);
    }, [webhookUrl]);

    const handleDefenseChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onDefenseEnabledChange(e.target.checked);
    }, [onDefenseEnabledChange]);

    const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setUrlDraft(e.target.value);
        setTestStatus('idle');
    }, []);

    const handleUrlBlur = useCallback(() => {
        if (urlDraft !== webhookUrl) onWebhookUrlChange(urlDraft);
    }, [urlDraft, webhookUrl, onWebhookUrlChange]);

    const handleWebhookEnabledChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onWebhookEnabledChange(e.target.checked);
    }, [onWebhookEnabledChange]);

    const handleTest = useCallback(async () => {
        const url = urlDraft.trim();
        if (!url) return;
        setTestStatus('testing');
        try {
            const ok = await window.fortis.testWebhook(url);
            setTestStatus(ok ? 'ok' : 'fail');
        } catch {
            setTestStatus('fail');
        }
    }, [urlDraft]);

    const urlEmpty = urlDraft.trim().length === 0;

    return (
        <Card
            header={
                <div className="settings-section__header">
                    <ShieldCheck size={18} strokeWidth={1.5} className="settings-section__icon" />
                    <span className="settings-section__title">{t('settings.defense.title')}</span>
                </div>
            }
        >
            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={defenseId} className="settings-field__label">{t('settings.defense.enable')}</label>
                    <span className="settings-field__hint">{t('settings.defense.enableHint')}</span>
                </div>
                <div className="settings-field__control">
                    <label className="settings-toggle">
                        <input
                            id={defenseId}
                            type="checkbox"
                            className="settings-toggle__input"
                            checked={defenseEnabled}
                            onChange={handleDefenseChange}
                        />
                        <span className="settings-toggle__track" />
                    </label>
                </div>
            </div>

            <div className="settings-field settings-field--stacked-messages">
                <div className="settings-field__row">
                    <div className="settings-field__label-group">
                        <label htmlFor={urlId} className="settings-field__label">{t('settings.defense.webhookUrl')}</label>
                        <span className="settings-field__hint">{t('settings.defense.webhookUrlHint')}</span>
                    </div>
                    <div className="settings-field__control">
                        <div className="settings-input-group">
                            <input
                                id={urlId}
                                type="text"
                                className="settings-input"
                                placeholder="https://hooks.slack.com/services/..."
                                value={urlDraft}
                                onChange={handleUrlChange}
                                onBlur={handleUrlBlur}
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
                                disabled={urlEmpty || testStatus === 'testing'}
                            >
                                {t('settings.defense.sendTest')}
                            </Button>
                        </div>
                    </div>
                </div>
                {testStatus === 'ok' && (
                    <p className="settings-field__success settings-field__message">{t('settings.defense.testOk')}</p>
                )}
                {testStatus === 'fail' && (
                    <p className="settings-field__error settings-field__message">{t('settings.defense.testFail')}</p>
                )}
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={webhookId} className="settings-field__label">{t('settings.defense.enableWebhook')}</label>
                    <span className="settings-field__hint">{t('settings.defense.enableWebhookHint')}</span>
                </div>
                <div className="settings-field__control">
                    <label className="settings-toggle">
                        <input
                            id={webhookId}
                            type="checkbox"
                            className="settings-toggle__input"
                            checked={webhookEnabled}
                            onChange={handleWebhookEnabledChange}
                            disabled={urlEmpty}
                        />
                        <span className="settings-toggle__track" />
                    </label>
                </div>
            </div>

            <div className="settings-note">
                <Info size={14} strokeWidth={1.5} className="settings-note__icon" />
                <span className="settings-note__text">
                    {t('settings.defense.note')}
                </span>
            </div>
        </Card>
    );
}

export default DefenseSection;
