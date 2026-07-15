import { useState, useCallback, useEffect, useId } from 'react';
import { Loader2, Check, X, Server } from 'lucide-react';
import Select from '../common/Select';
import type { SelectOption } from '../common/Select';
import { useI18n } from '../../i18n';

interface OllamaConfigPanelProps {
    endpoint: string;
    model: string;
    onConfigChange: (config: { endpoint?: string; model?: string }) => void;
}

type TestStatus = 'idle' | 'testing' | 'available' | 'unavailable';

function OllamaConfigPanel({ endpoint, model, onConfigChange }: OllamaConfigPanelProps) {
    const { t, tn } = useI18n();
    const [endpointDraft, setEndpointDraft] = useState(endpoint);
    const [models, setModels] = useState<string[]>([]);
    const [testStatus, setTestStatus] = useState<TestStatus>('idle');
    const [failedEndpoint, setFailedEndpoint] = useState('');
    const endpointId = useId();
    const modelId = useId();

    useEffect(() => {
        setEndpointDraft(endpoint);
    }, [endpoint]);

    const discover = useCallback(async (ep: string) => {
        setTestStatus('testing');
        setFailedEndpoint('');
        try {
            const result = await window.fortis.discoverOllamaModels(ep);
            if (result.available) {
                setModels(result.models);
                setTestStatus('available');
            } else {
                setModels([]);
                setTestStatus('unavailable');
                setFailedEndpoint(ep);
            }
        } catch {
            setModels([]);
            setTestStatus('unavailable');
        }
    }, []);

    useEffect(() => {
        void discover(endpoint);
    }, [discover, endpoint]);

    const handleEndpointBlur = useCallback(() => {
        if (endpointDraft !== endpoint) {
            onConfigChange({ endpoint: endpointDraft });
        }
    }, [endpointDraft, endpoint, onConfigChange]);

    const handleModelChange = useCallback((value: string) => {
        if (value.length === 0) return;
        onConfigChange({ model: value });
    }, [onConfigChange]);

    const modelOptions: ReadonlyArray<SelectOption<string>> = models.length > 0
        ? models.map((m) => ({ value: m, label: m }))
        : model
            ? [{ value: model, label: model }]
            : [{ value: '', label: t('settings.ollama.noModels') }];

    return (
        <div className="settings-field settings-field--stacked-messages">
            <div className="settings-field__row">
                <div className="settings-field__label-group">
                    <label htmlFor={endpointId} className="settings-field__label">{t('settings.ollama.endpoint')}</label>
                    <span className="settings-field__hint">{t('settings.ollama.endpointHint')}</span>
                </div>
                <div className="settings-field__control">
                    <div className="settings-input-group">
                        <input
                            id={endpointId}
                            type="text"
                            className="settings-input"
                            placeholder="http://127.0.0.1:11434"
                            value={endpointDraft}
                            onChange={(e) => setEndpointDraft(e.target.value)}
                            onBlur={handleEndpointBlur}
                            autoComplete="off"
                            spellCheck={false}
                        />
                        <button
                            type="button"
                            className="settings-verify-btn"
                            onClick={() => { void discover(endpointDraft); }}
                            disabled={testStatus === 'testing'}
                        >
                            {testStatus === 'testing' && <Loader2 size={14} strokeWidth={1.5} className="spin" />}
                            {testStatus === 'available' && <Check size={14} strokeWidth={2} />}
                            {testStatus === 'unavailable' && <X size={14} strokeWidth={2} />}
                            {testStatus === 'testing' ? t('settings.ai.testing') : t('settings.ollama.testConnection')}
                        </button>
                    </div>
                </div>
            </div>

            <div className="settings-field__row">
                <div className="settings-field__label-group">
                    <label htmlFor={modelId} className="settings-field__label">{t('settings.ollama.model')}</label>
                    <span className="settings-field__hint">{t('settings.ollama.modelHint')}</span>
                </div>
                <div className="settings-field__control">
                    <Select
                        id={modelId}
                        className="settings-select"
                        value={model}
                        options={modelOptions}
                        onChange={handleModelChange}
                    />
                </div>
            </div>

            {testStatus === 'available' && (
                <p className="settings-field__success settings-field__message">
                    {models.length > 0
                        ? tn('settings.ollama.connectedModels', models.length)
                        : t('settings.ollama.connectedNoModels')}
                </p>
            )}
            {testStatus === 'unavailable' && (
                <p className="settings-field__error settings-field__message">
                    {failedEndpoint
                        ? t('settings.ollama.unreachable', { endpoint: failedEndpoint })
                        : t('settings.ollama.connectionFailed')}
                </p>
            )}

            <div className="settings-note">
                <Server size={14} strokeWidth={1.5} className="settings-note__icon" />
                <span className="settings-note__text">
                    {t('settings.ollama.note')}
                </span>
            </div>
        </div>
    );
}

export default OllamaConfigPanel;
