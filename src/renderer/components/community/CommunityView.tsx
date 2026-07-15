import { useCallback, useEffect, useState } from 'react';
import { Share2, ShieldCheck, Lock, AlertTriangle } from 'lucide-react';
import { Button, Badge, Card, Select, UpgradePrompt } from '../common';
import useCommunity from '../../hooks/useCommunity';
import { useSettingsStore, selectTier } from '../../stores';
import { useUIStore } from '../../stores/ui-store';
import { useI18n } from '../../i18n';
import ThreatIntelPayloadPanel from './ThreatIntelPayloadPanel';
import type { ThreatLevel } from '@shared/types/analysis';
import '../../styles/components/settings.css';
import '../../styles/components/community-view.css';

const SEVERITY_OPTIONS: ReadonlyArray<{ value: ThreatLevel; label: string }> = [
    { value: 'info', label: 'Info' },
    { value: 'warning', label: 'Warning' },
    { value: 'danger', label: 'Danger' },
    { value: 'critical', label: 'Critical' },
];

type TestResult = { ok: boolean; message: string } | null;

function relativeTime(ts: number, now: number): string {
    const sec = Math.max(0, Math.round((now - ts) / 1000));
    if (sec < 60) return `${sec}s`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.round(min / 60);
    return `${hr}h`;
}

function CommunityView() {
    const { t } = useI18n();
    const { state, setEnabled, setConfig, test, preview } = useCommunity();
    const tier = useSettingsStore(selectTier);
    const savedEndpoint = useSettingsStore((s) => s.settings.threatIntelEndpoint);
    const locked = tier === 'free';

    const [endpoint, setEndpoint] = useState(savedEndpoint);
    const [apiKey, setApiKey] = useState('');
    const [severityFloor, setSeverityFloor] = useState<ThreatLevel>(state.severityFloor);
    const [testing, setTesting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState<TestResult>(null);
    const [upgradeOpen, setUpgradeOpen] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => setEndpoint(savedEndpoint), [savedEndpoint]);
    useEffect(() => setSeverityFloor(state.severityFloor), [state.severityFloor]);

    useEffect(() => {
        if (state.lastSubmittedAt === null) return;
        const id = window.setInterval(() => setNow(Date.now()), 30_000);
        return () => window.clearInterval(id);
    }, [state.lastSubmittedAt]);

    const handleToggle = useCallback(async (): Promise<void> => {
        setResult(null);
        try {
            await setEnabled(!state.enabled);
        } catch (err) {
            setResult({ ok: false, message: err instanceof Error ? err.message : t('community.testFailed') });
        }
    }, [setEnabled, state.enabled, t]);

    const handleSaveConfig = useCallback(async (): Promise<void> => {
        setSaving(true);
        setResult(null);
        const trimmed = endpoint.trim();
        try {
            // The main process pushes the authoritative settings back over
            // `settings:changed`, which rehydrates `savedEndpoint`.
            await setConfig({ endpoint: trimmed, key: apiKey, severityFloor });
            setApiKey('');
            setResult({ ok: true, message: t('community.saved') });
        } catch (err) {
            setResult({ ok: false, message: err instanceof Error ? err.message : t('community.testFailed') });
        } finally {
            setSaving(false);
        }
    }, [setConfig, endpoint, apiKey, severityFloor, t]);

    const handleTest = useCallback(async (): Promise<void> => {
        setTesting(true);
        setResult(null);
        const trimmed = endpoint.trim();
        try {
            const ok = await test(trimmed, apiKey);
            setResult({ ok, message: ok ? t('community.testOk') : t('community.testFailed') });
            if (ok) setApiKey('');
        } catch (err) {
            setResult({ ok: false, message: err instanceof Error ? err.message : t('community.testFailed') });
        } finally {
            setTesting(false);
        }
    }, [test, endpoint, apiKey, t]);

    const handleUpgrade = (): void => {
        setUpgradeOpen(false);
        useUIStore.getState().setLicenseDialogOpen(true);
    };

    const inactive = state.enabled && !state.verified;

    return (
        <div className="community-view">
            <div className={locked ? 'community-view__lock' : undefined}>
                {/* inert keeps the locked panel out of the tab order, so the
                    overlay is a real gate and not just a visual one. */}
                <div className="community-view__body" inert={locked}>
                    <Card
                        header={
                            <div className="settings-section__header">
                                <Share2 size={18} strokeWidth={1.5} className="settings-section__icon" aria-hidden="true" />
                                <span className="settings-section__title">{t('community.title')}</span>
                            </div>
                        }
                    >
                        <p className="community-view__subtitle">{t('community.subtitle')}</p>

                        <div className="community-view__row">
                            <div className="community-view__optin">
                                <span className="community-view__optin-label">{t('community.optIn')}</span>
                                <Button
                                    variant={state.enabled ? 'primary' : 'secondary'}
                                    size="sm"
                                    onClick={() => void handleToggle()}
                                    aria-pressed={state.enabled}
                                >
                                    {state.enabled ? t('common.enabled') : t('common.disabled')}
                                </Button>
                            </div>
                            <div className="community-view__badges">
                                <Badge variant={state.configured ? 'info' : 'neutral'}>
                                    {state.configured ? t('community.configured') : t('community.notConfigured')}
                                </Badge>
                                <Badge variant={state.verified ? 'safe' : 'neutral'}>
                                    {state.verified ? t('community.verified') : t('community.notVerified')}
                                </Badge>
                            </div>
                        </div>
                        <p className="community-view__hint">{t('community.optInHint')}</p>

                        {inactive && (
                            <p className="community-view__notice" role="status">
                                <AlertTriangle size={14} strokeWidth={1.5} aria-hidden="true" />
                                {t('community.inactiveHint')}
                            </p>
                        )}

                        <label className="community-view__field">
                            <span className="settings-field__label">{t('community.endpoint')}</span>
                            <input
                                className="settings-input community-view__input"
                                type="url"
                                value={endpoint}
                                onChange={(e) => setEndpoint(e.target.value)}
                                placeholder="https://intel.example.com/submit"
                                aria-label={t('community.endpoint')}
                            />
                        </label>

                        <label className="community-view__field">
                            <span className="settings-field__label">{t('community.key')}</span>
                            <input
                                className="settings-input community-view__input"
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={state.configured ? '••••••••' : t('community.keyPlaceholder')}
                                aria-label={t('community.key')}
                            />
                            <span className="settings-field__hint">{t('community.keyHint')}</span>
                        </label>

                        <div className="community-view__field">
                            <span className="settings-field__label" id="community-severity-label">
                                {t('community.severityFloor')}
                            </span>
                            <Select
                                value={severityFloor}
                                options={SEVERITY_OPTIONS}
                                onChange={setSeverityFloor}
                                ariaLabelledBy="community-severity-label"
                            />
                        </div>

                        <div className="community-view__actions">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => void handleSaveConfig()}
                                disabled={saving || testing}
                            >
                                {t('common.save')}
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => void handleTest()}
                                disabled={testing || saving || endpoint.trim().length === 0}
                            >
                                <ShieldCheck size={14} strokeWidth={1.5} aria-hidden="true" />{' '}
                                {testing ? t('community.testing') : t('community.test')}
                            </Button>
                        </div>

                        {result !== null && (
                            <p
                                className={`community-view__result community-view__result--${result.ok ? 'ok' : 'error'}`}
                                role="status"
                            >
                                {result.message}
                            </p>
                        )}

                        <div className="community-view__summary">
                            <div className="community-view__summary-item">
                                <span className="community-view__summary-label">{t('community.submitted')}</span>
                                <span className="community-view__summary-value">{state.submittedCount}</span>
                            </div>
                            <div className="community-view__summary-item">
                                <span className="community-view__summary-label">{t('community.lastSubmitted')}</span>
                                <span className="community-view__summary-value">
                                    {state.lastSubmittedAt === null
                                        ? t('community.never')
                                        : relativeTime(state.lastSubmittedAt, now)}
                                </span>
                            </div>
                        </div>
                    </Card>

                    <ThreatIntelPayloadPanel preview={preview} severityFloor={state.severityFloor} />
                </div>

                {locked && (
                    <button
                        type="button"
                        className="community-view__lock-overlay"
                        aria-label={t('community.tierLocked')}
                        onClick={() => setUpgradeOpen(true)}
                    >
                        <Lock size={24} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                )}
            </div>

            <UpgradePrompt isOpen={upgradeOpen} onDismiss={() => setUpgradeOpen(false)} onUpgrade={handleUpgrade} />
        </div>
    );
}

export default CommunityView;
