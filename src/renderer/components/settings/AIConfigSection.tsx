import { useState, useCallback, useId, useEffect } from 'react';
import {
    Eye,
    EyeOff,
    Info,
    ShieldCheck,
    Check,
    X,
    Loader2,
    Save,
    Zap,
    Activity,
    Coins,
    BarChart3,
} from 'lucide-react';
import type { AIProvider } from '../../types';
import useAIStatus from '../../hooks/useAIStatus';
import Card from '../common/Card';
import Select from '../common/Select';
import type { SelectOption } from '../common/Select';
import Button from '../common/Button';
import OllamaConfigPanel from './OllamaConfigPanel';
import AiPayloadDialog from '../ai/AiPayloadDialog';
import { useI18n } from '../../i18n';

interface AIConfigSectionProps {
    aiProvider: AIProvider;
    onAIProviderChange: (provider: AIProvider) => void;
    ollamaEndpoint: string;
    ollamaModel: string;
    onOllamaConfigChange: (config: { endpoint?: string; model?: string }) => void;
    openaiCompatibleEndpoint: string;
    onOpenaiCompatibleEndpointChange: (endpoint: string) => void;
}

type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid';

function formatCost(usd: number): string {
    if (usd < 0.01) return '<$0.01';
    return `$${usd.toFixed(2)}`;
}

function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

function AIConfigSection({ aiProvider, onAIProviderChange, ollamaEndpoint, ollamaModel, onOllamaConfigChange, openaiCompatibleEndpoint, onOpenaiCompatibleEndpointChange }: AIConfigSectionProps) {
    const { t } = useI18n();
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle');
    const [validationError, setValidationError] = useState('');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [saveError, setSaveError] = useState('');
    const [payloadOpen, setPayloadOpen] = useState(false);
    const providerId = useId();
    const keyId = useId();

    const { aiStatus, usageStats, loading: statusLoading, refresh: refreshStatus } = useAIStatus();

    const providerOptions: ReadonlyArray<SelectOption<AIProvider>> = [
        { value: 'none', label: t('settings.ai.providerNone') },
        { value: 'openai', label: 'OpenAI' },
        { value: 'anthropic', label: 'Anthropic' },
        { value: 'ollama', label: t('settings.ai.providerOllama') },
    ];

    useEffect(() => {
        if (saveStatus === 'saved') {
            const timer = setTimeout(() => setSaveStatus('idle'), 3000);
            return () => clearTimeout(timer);
        }
    }, [saveStatus]);

    const handleProviderChange = useCallback((provider: AIProvider) => {
        onAIProviderChange(provider);
        setApiKey('');
        setValidationStatus('idle');
        setValidationError('');
        setSaveStatus('idle');
        setSaveError('');
        setTimeout(() => { void refreshStatus(); }, 500);
    }, [onAIProviderChange, refreshStatus]);

    const handleKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setApiKey(e.target.value);
        setValidationStatus('idle');
        setValidationError('');
        setSaveStatus('idle');
        setSaveError('');
    }, []);

    const toggleShowKey = useCallback(() => {
        setShowKey(prev => !prev);
    }, []);

    const handleVerify = useCallback(async () => {
        if (!apiKey || aiProvider === 'none') return;

        setValidationStatus('validating');
        setValidationError('');

        try {
            const result = await window.fortis.validateApiKey(aiProvider, apiKey);
            if (result.valid) {
                setValidationStatus('valid');
            } else {
                setValidationStatus('invalid');
                setValidationError(result.error ?? t('settings.ai.validationFailed'));
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : t('settings.ai.validationRequestFailed');
            setValidationStatus('invalid');
            setValidationError(message);
        }
    }, [apiKey, aiProvider, t]);

    const handleSave = useCallback(async () => {
        if (!apiKey || aiProvider === 'none') return;

        setSaveStatus('saving');
        setSaveError('');

        try {
            const result = await window.fortis.setApiKey(aiProvider, apiKey);
            if (result.success) {
                setSaveStatus('saved');
                setTimeout(() => { void refreshStatus(); }, 300);
            } else {
                setSaveStatus('error');
                setSaveError(result.error ?? t('settings.ai.saveKeyFailed'));
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : t('settings.ai.saveKeyFailed');
            setSaveStatus('error');
            setSaveError(message);
        }
    }, [apiKey, aiProvider, refreshStatus, t]);

    const showApiKeyField = aiProvider !== 'none' && aiProvider !== 'ollama';
    const endpointId = useId();
    const [endpointDraft, setEndpointDraft] = useState(openaiCompatibleEndpoint);
    const handleEndpointSave = useCallback(() => {
        onOpenaiCompatibleEndpointChange(endpointDraft.trim());
    }, [onOpenaiCompatibleEndpointChange, endpointDraft]);
    const showOllamaPanel = aiProvider === 'ollama';

    const providerStatusDot = (): { className: string; label: string } => {
        if (validationStatus === 'validating') {
            return { className: 'ai-status-dot--testing', label: t('settings.ai.testing') };
        }
        if (aiProvider === 'none') {
            return { className: 'ai-status-dot--disconnected', label: t('settings.ai.statusNotConfigured') };
        }
        if (!aiStatus || statusLoading) {
            return { className: 'ai-status-dot--unknown', label: t('settings.ai.statusChecking') };
        }
        if (saveStatus === 'saved') {
            return { className: 'ai-status-dot--connected', label: t('settings.ai.statusConnected') };
        }
        if (aiStatus.isAvailable) {
            return { className: 'ai-status-dot--connected', label: t('settings.ai.statusConnected') };
        }
        return { className: 'ai-status-dot--warning', label: t('settings.ai.statusKeyRequired') };
    };

    const statusInfo = providerStatusDot();

    return (
        <Card
            header={
                <div className="settings-section__header">
                    <ShieldCheck size={18} strokeWidth={1.5} className="settings-section__icon" />
                    <span className="settings-section__title">{t('settings.ai.title')}</span>
                </div>
            }
        >
            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={providerId} className="settings-field__label">{t('settings.ai.provider')}</label>
                    <span className="settings-field__hint">{t('settings.ai.providerHint')}</span>
                </div>
                <div className="settings-field__control">
                    <div className="ai-status-indicator">
                        <span className={`ai-status-dot ${statusInfo.className}`} />
                        <span className="ai-status-label">{statusInfo.label}</span>
                    </div>
                    <Select
                        id={providerId}
                        className="settings-select"
                        value={aiProvider}
                        options={providerOptions}
                        onChange={handleProviderChange}
                    />
                </div>
            </div>

            {showOllamaPanel && (
                <OllamaConfigPanel
                    endpoint={ollamaEndpoint}
                    model={ollamaModel}
                    onConfigChange={onOllamaConfigChange}
                />
            )}

            {showApiKeyField && (
                <div className="settings-field settings-field--stacked-messages">
                    <div className="settings-field__row">
                        <div className="settings-field__label-group">
                            <label htmlFor={keyId} className="settings-field__label">{t('settings.ai.apiKey')}</label>
                            <span className="settings-field__hint">{t('settings.ai.apiKeyHint')}</span>
                        </div>
                        <div className="settings-field__control">
                            <div className="settings-input-group">
                                <input
                                    id={keyId}
                                    type={showKey ? 'text' : 'password'}
                                    className="settings-input"
                                    placeholder={aiStatus?.isAvailable ? '••••••••••••••••••••••••' : 'sk-...'}
                                    value={apiKey}
                                    onChange={handleKeyChange}
                                    autoComplete="off"
                                    spellCheck={false}
                                    data-lpignore="true"
                                    data-1p-ignore="true"
                                />
                                <button
                                    type="button"
                                    className="settings-icon-btn"
                                    onClick={toggleShowKey}
                                    aria-label={showKey ? t('settings.ai.hideKey') : t('settings.ai.showKey')}
                                >
                                    {showKey
                                        ? <EyeOff size={16} strokeWidth={1.5} />
                                        : <Eye size={16} strokeWidth={1.5} />
                                    }
                                </button>
                                <button
                                    type="button"
                                    className="settings-verify-btn"
                                    onClick={handleVerify}
                                    disabled={!apiKey || validationStatus === 'validating'}
                                >
                                    {validationStatus === 'validating' && <Loader2 size={14} strokeWidth={1.5} className="spin" />}
                                    {validationStatus === 'valid' && <Check size={14} strokeWidth={2} />}
                                    {validationStatus === 'invalid' && <X size={14} strokeWidth={2} />}
                                    {validationStatus === 'validating' ? t('settings.ai.testing') : validationStatus === 'valid' ? t('settings.ai.verified') : t('settings.ai.verify')}
                                </button>
                                <button
                                    type="button"
                                    className="settings-save-btn"
                                    onClick={handleSave}
                                    disabled={!apiKey || saveStatus === 'saving'}
                                >
                                    {saveStatus === 'saving' && <Loader2 size={14} strokeWidth={1.5} className="spin" />}
                                    {saveStatus === 'saved' && <Check size={14} strokeWidth={2} />}
                                    {saveStatus !== 'saving' && saveStatus !== 'saved' && <Save size={14} strokeWidth={1.5} />}
                                    {saveStatus === 'saving' ? t('settings.ai.saving') : saveStatus === 'saved' ? t('settings.ai.saved') : t('common.save')}
                                </button>
                            </div>
                        </div>
                    </div>
                    {validationStatus === 'valid' && (
                        <p className="settings-field__success settings-field__message">{t('settings.ai.keyVerified')}</p>
                    )}
                    {validationStatus === 'invalid' && validationError && (
                        <p className="settings-field__error settings-field__message">{validationError}</p>
                    )}
                    {saveStatus === 'error' && saveError && (
                        <p className="settings-field__error settings-field__message">{saveError}</p>
                    )}
                </div>
            )}

            {aiProvider === 'openai' && (
                <div className="settings-field">
                    <div className="settings-field__label-group">
                        <label htmlFor={endpointId} className="settings-field__label">{t('settings.ai.customEndpoint')}</label>
                        <span className="settings-field__hint">{t('settings.ai.customEndpointHint')}</span>
                    </div>
                    <div className="settings-field__control">
                        <div className="settings-input-group">
                            <input
                                id={endpointId}
                                type="text"
                                className="settings-input"
                                placeholder="https://127.0.0.1:8000/v1"
                                value={endpointDraft}
                                onChange={(e) => setEndpointDraft(e.target.value)}
                                autoComplete="off"
                                spellCheck={false}
                            />
                            <Button variant="secondary" size="sm" onClick={handleEndpointSave}>{t('settings.ai.saveEndpoint')}</Button>
                        </div>
                    </div>
                </div>
            )}

            {showApiKeyField && usageStats && (
                <div className="ai-usage-stats">
                    <div className="ai-usage-stats__header">
                        <BarChart3 size={14} strokeWidth={1.5} />
                        <span>{t('settings.ai.usageStats')}</span>
                    </div>
                    <div className="ai-usage-stats__grid">
                        <div className="ai-usage-stat">
                            <div className="ai-usage-stat__icon">
                                <Zap size={14} strokeWidth={1.5} />
                            </div>
                            <div className="ai-usage-stat__content">
                                <span className="ai-usage-stat__value">{usageStats.callsToday}</span>
                                <span className="ai-usage-stat__label">{t('settings.ai.callsToday')}</span>
                            </div>
                        </div>
                        <div className="ai-usage-stat">
                            <div className="ai-usage-stat__icon">
                                <Activity size={14} strokeWidth={1.5} />
                            </div>
                            <div className="ai-usage-stat__content">
                                <span className="ai-usage-stat__value">{formatNumber(usageStats.totalTokens)}</span>
                                <span className="ai-usage-stat__label">{t('settings.ai.tokensUsed')}</span>
                            </div>
                        </div>
                        <div className="ai-usage-stat">
                            <div className="ai-usage-stat__icon">
                                <Coins size={14} strokeWidth={1.5} />
                            </div>
                            <div className="ai-usage-stat__content">
                                <span className="ai-usage-stat__value">{formatCost(usageStats.totalCostUSD)}</span>
                                <span className="ai-usage-stat__label">{t('settings.ai.estCost')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="settings-note">
                <Info size={14} strokeWidth={1.5} className="settings-note__icon" />
                <span className="settings-note__text">
                    {t('settings.ai.encryptionNote')}
                </span>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <span className="settings-field__label">{t('settings.ai.transparency')}</span>
                    <span className="settings-field__hint">{t('settings.ai.transparencyHint')}</span>
                </div>
                <div className="settings-field__control">
                    <Button variant="secondary" size="sm" icon={Eye} onClick={() => setPayloadOpen(true)}>
                        {t('settings.ai.viewPayload')}
                    </Button>
                </div>
            </div>

            <AiPayloadDialog isOpen={payloadOpen} onClose={() => setPayloadOpen(false)} />
        </Card>
    );
}

export default AIConfigSection;
