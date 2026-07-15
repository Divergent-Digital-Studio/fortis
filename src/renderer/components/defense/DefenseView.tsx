import { useMemo, useState } from 'react';
import { ShieldCheck, Ban, ScrollText, Lock, Plus, Trash2, Power, ShieldOff, X } from 'lucide-react';
import { Button, Badge, Card, EmptyState, Select, UpgradePrompt } from '../common';
import { ConfirmDialog } from '../common/ConfirmDialog';
import useDefense, { useDefenseSync } from '../../hooks/useDefense';
import { useI18n } from '../../i18n';
import { useSettingsStore, selectTier } from '../../stores';
import { useUIStore } from '../../stores/ui-store';
import type {
    CustomRule,
    RuleCondition,
    RuleField,
    RuleOperator,
    RuleAction,
    DefenseAction,
    DefenseActionStatus,
    CertStatus,
} from '@shared/types/m3';
import type { ThreatLevel } from '@shared/types/analysis';
import '../../styles/components/defense-view.css';

type DefenseTab = 'actions' | 'blocked' | 'rules' | 'certs';

interface PendingIntent {
    kind: 'kill' | 'block' | 'unblock';
    ref: string;
    title: string;
    message: string;
    destructive: boolean;
}

const TABS: ReadonlyArray<{ tab: DefenseTab; labelKey: string }> = [
    { tab: 'actions', labelKey: 'defense.tab.actions' },
    { tab: 'blocked', labelKey: 'defense.tab.blocked' },
    { tab: 'rules', labelKey: 'defense.tab.rules' },
    { tab: 'certs', labelKey: 'defense.tab.certs' },
];

const FIELD_OPTIONS: ReadonlyArray<{ value: RuleField; labelKey: string }> = [
    { value: 'process', labelKey: 'defense.field.process' },
    { value: 'remotePort', labelKey: 'defense.field.remotePort' },
    { value: 'remoteAddress', labelKey: 'defense.field.remoteAddress' },
    { value: 'country', labelKey: 'defense.field.country' },
    { value: 'protocol', labelKey: 'defense.field.protocol' },
];

// `inCidr` is only evaluated for remoteAddress (see rules/rule-eval.ts), so it
// is offered only for that field — otherwise the rule silently never matches.
const OPERATOR_OPTIONS: ReadonlyArray<{ value: RuleOperator; labelKey: string }> = [
    { value: 'equals', labelKey: 'defense.operator.equals' },
    { value: 'notEquals', labelKey: 'defense.operator.notEquals' },
    { value: 'contains', labelKey: 'defense.operator.contains' },
];

const ADDRESS_OPERATOR_OPTIONS: ReadonlyArray<{ value: RuleOperator; labelKey: string }> = [
    ...OPERATOR_OPTIONS,
    { value: 'inCidr', labelKey: 'defense.operator.inCidr' },
];

function operatorsFor(field: RuleField): ReadonlyArray<{ value: RuleOperator; labelKey: string }> {
    return field === 'remoteAddress' ? ADDRESS_OPERATOR_OPTIONS : OPERATOR_OPTIONS;
}

const ACTION_OPTIONS: ReadonlyArray<{ value: RuleAction; labelKey: string }> = [
    { value: 'alert', labelKey: 'defense.action.alert' },
    { value: 'suggest-kill', labelKey: 'defense.action.suggestKill' },
    { value: 'suggest-block', labelKey: 'defense.action.suggestBlock' },
];

const RULE_ACTION_KEYS: Record<RuleAction, string> = {
    alert: 'defense.action.alert',
    'suggest-kill': 'defense.action.suggestKill',
    'suggest-block': 'defense.action.suggestBlock',
};

const THREAT_OPTIONS: ReadonlyArray<{ value: ThreatLevel; labelKey: string }> = [
    { value: 'info', labelKey: 'connections.threat.info' },
    { value: 'warning', labelKey: 'connections.threat.warning' },
    { value: 'danger', labelKey: 'connections.threat.danger' },
    { value: 'critical', labelKey: 'connections.threat.critical' },
];

function toOptions<T extends string>(
    options: ReadonlyArray<{ value: T; labelKey: string }>,
    t: (key: string) => string,
): Array<{ value: T; label: string }> {
    return options.map((o) => ({ value: o.value, label: t(o.labelKey) }));
}

function statusVariant(status: DefenseActionStatus): ThreatLevel | 'neutral' {
    if (status === 'executed') return 'safe';
    if (status === 'failed') return 'danger';
    return 'neutral';
}

function certStatusVariant(status: CertStatus): ThreatLevel | 'neutral' {
    if (status === 'valid') return 'safe';
    if (status === 'expiring') return 'warning';
    if (status === 'expired' || status === 'self-signed') return 'danger';
    return 'neutral';
}

function formatTimestamp(ms: number | null): string {
    if (!ms) return '—';
    return new Date(ms).toLocaleString();
}

function RulesTab() {
    const { t } = useI18n();
    const { rules, saveRule, deleteRule } = useDefense();
    const [name, setName] = useState('');
    const [conditions, setConditions] = useState<RuleCondition[]>([]);
    const [action, setAction] = useState<RuleAction>('alert');
    const [threatLevel, setThreatLevel] = useState<ThreatLevel>('warning');

    const addCondition = (): void => {
        setConditions((prev) => [...prev, { field: 'process', operator: 'equals', value: '' }]);
    };

    const removeCondition = (index: number): void => {
        setConditions((prev) => prev.filter((_, i) => i !== index));
    };

    const updateCondition = (index: number, patch: Partial<RuleCondition>): void => {
        setConditions((prev) =>
            prev.map((c, i) => {
                if (i !== index) return c;
                const next = { ...c, ...patch };
                const allowed = operatorsFor(next.field);
                if (!allowed.some((o) => o.value === next.operator)) next.operator = 'equals';
                return next;
            }),
        );
    };

    // A rule with no conditions never matches (evaluateRule returns false), and
    // a blank value matches nothing useful — refuse to persist either.
    const trimmedName = name.trim();
    const canSave =
        trimmedName.length > 0 &&
        conditions.length > 0 &&
        conditions.every((c) => c.value.trim().length > 0);

    const handleSave = (): void => {
        if (!canSave) return;
        const cleaned = conditions.map((c) => ({ ...c, value: c.value.trim() }));
        void saveRule({ id: '', name: trimmedName, enabled: true, conditions: cleaned, action, threatLevel, createdAt: 0 });
        setName('');
        setConditions([]);
        setAction('alert');
        setThreatLevel('warning');
    };

    const toggleEnabled = (rule: CustomRule): void => {
        void saveRule({ ...rule, enabled: !rule.enabled });
    };

    return (
        <div className="defense-view__panel">
            {rules.length === 0 ? (
                <EmptyState
                    icon={ScrollText}
                    title={t('defense.rules.emptyTitle')}
                    message={t('defense.rules.emptyMessage')}
                />
            ) : (
                <div className="defense-view__list">
                    {rules.map((rule) => (
                        <Card key={rule.id}>
                            <div className="defense-view__rule-head">
                                <div className="defense-view__rule-meta">
                                    <span className="defense-view__rule-name">{rule.name}</span>
                                    <Badge variant="neutral" size="sm" showIcon={false}>
                                        {t(RULE_ACTION_KEYS[rule.action])}
                                    </Badge>
                                    <Badge variant={rule.threatLevel} size="sm" showIcon={false}>
                                        {t(`connections.threat.${rule.threatLevel}`)}
                                    </Badge>
                                    {!rule.enabled && (
                                        <Badge variant="neutral" size="sm" showIcon={false}>
                                            {t('common.disabled')}
                                        </Badge>
                                    )}
                                </div>
                                <div className="defense-view__rule-actions">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        icon={Power}
                                        onClick={() => toggleEnabled(rule)}
                                    >
                                        {rule.enabled ? t('defense.rules.disable') : t('defense.rules.enable')}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        icon={Trash2}
                                        onClick={() => void deleteRule(rule.id)}
                                    >
                                        {t('defense.rules.delete')}
                                    </Button>
                                </div>
                            </div>
                            <div className="defense-view__rule-conditions">
                                {rule.conditions.map((c, i) => (
                                    <span key={`${rule.id}-${i}`} className="defense-view__condition-chip">
                                        {t(`defense.field.${c.field}`)} {t(`defense.operator.${c.operator}`)} {c.value}
                                    </span>
                                ))}
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Card>
                <div className="defense-view__builder">
                    <span className="defense-view__builder-title">{t('defense.rules.newRule')}</span>
                    <input
                        className="defense-view__input"
                        type="text"
                        value={name}
                        placeholder={t('defense.rules.name')}
                        aria-label={t('defense.rules.name')}
                        onChange={(e) => setName(e.target.value)}
                    />

                    <div className="defense-view__conditions">
                        {conditions.map((condition, index) => (
                            <div key={index} className="defense-view__condition-row">
                                <Select
                                    value={condition.field}
                                    options={toOptions(FIELD_OPTIONS, t)}
                                    ariaLabel={t('defense.rules.conditionField')}
                                    onChange={(value) => updateCondition(index, { field: value })}
                                />
                                <Select
                                    value={condition.operator}
                                    options={toOptions(operatorsFor(condition.field), t)}
                                    ariaLabel={t('defense.rules.conditionOperator')}
                                    onChange={(value) => updateCondition(index, { operator: value })}
                                />
                                <input
                                    className="defense-view__input"
                                    type="text"
                                    value={condition.value}
                                    placeholder={t('defense.rules.valuePlaceholder')}
                                    aria-label={t('defense.rules.conditionValue')}
                                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                                />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    icon={Trash2}
                                    iconOnly
                                    aria-label={t('defense.rules.removeCondition')}
                                    onClick={() => removeCondition(index)}
                                />
                            </div>
                        ))}
                    </div>

                    <Button variant="secondary" size="sm" icon={Plus} onClick={addCondition}>
                        {t('defense.rules.addCondition')}
                    </Button>

                    <div className="defense-view__builder-row">
                        <Select
                            value={action}
                            options={toOptions(ACTION_OPTIONS, t)}
                            ariaLabel={t('defense.rules.actionAria')}
                            onChange={setAction}
                        />
                        <Select
                            value={threatLevel}
                            options={toOptions(THREAT_OPTIONS, t)}
                            ariaLabel={t('defense.rules.threatAria')}
                            onChange={setThreatLevel}
                        />
                    </div>

                    <Button variant="primary" size="sm" disabled={!canSave} onClick={handleSave}>
                        {t('defense.rules.save')}
                    </Button>
                    {!canSave && (
                        <span className="defense-view__hint">
                            {t('defense.rules.hint')}
                        </span>
                    )}
                </div>
            </Card>
        </div>
    );
}

interface ActionsTabProps {
    onIntent: (intent: PendingIntent) => void;
}

function ActionsTab({ onIntent }: ActionsTabProps) {
    const { t } = useI18n();
    const { actions, cancelAction } = useDefense();
    const pending = useMemo(() => actions.filter((a) => a.status === 'pending'), [actions]);
    const history = useMemo(() => actions.filter((a) => a.status !== 'pending'), [actions]);

    const requestConfirm = (action: DefenseAction): void => {
        if (action.kind === 'kill') {
            const target = `${action.target}${action.processName ? ` (${action.processName})` : ''}`;
            onIntent({
                kind: 'kill',
                ref: action.id,
                title: t('defense.confirm.killTitle', { target: action.target }),
                message: t('defense.confirm.killMessage', { target }),
                destructive: true,
            });
        } else {
            onIntent({
                kind: 'block',
                ref: action.id,
                title: t('defense.confirm.blockTitle', { target: action.target }),
                message: t('defense.confirm.blockMessage', { target: action.target }),
                destructive: true,
            });
        }
    };

    return (
        <div className="defense-view__panel">
            <div className="defense-view__section">
                <span className="defense-view__section-title">{t('defense.actions.pending')}</span>
                {pending.length === 0 ? (
                    <EmptyState
                        icon={ShieldCheck}
                        title={t('defense.actions.emptyPendingTitle')}
                        message={t('defense.actions.emptyPendingMessage')}
                    />
                ) : (
                    <div className="defense-view__list">
                        {pending.map((action) => (
                            <Card key={action.id}>
                                <div className="defense-view__row-head">
                                    <div className="defense-view__row-meta">
                                        <Badge
                                            variant={action.kind === 'kill' ? 'danger' : 'warning'}
                                            size="sm"
                                            showIcon={false}
                                        >
                                            {t(`defense.kind.${action.kind}`)}
                                        </Badge>
                                        <span className="defense-view__row-target">{action.target}</span>
                                        {action.processName && (
                                            <Badge variant="neutral" size="sm" showIcon={false}>
                                                {action.processName}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="defense-view__rule-actions">
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            onClick={() => requestConfirm(action)}
                                        >
                                            {t('defense.confirmAction')}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => void cancelAction(action.id)}
                                        >
                                            {t('common.cancel')}
                                        </Button>
                                    </div>
                                </div>
                                <div className="defense-view__row-sub">{action.reason}</div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            <div className="defense-view__section">
                <span className="defense-view__section-title">{t('defense.actions.history')}</span>
                {history.length === 0 ? (
                    <EmptyState
                        icon={ScrollText}
                        title={t('defense.actions.emptyHistoryTitle')}
                        message={t('defense.actions.emptyHistoryMessage')}
                    />
                ) : (
                    <div className="defense-view__list">
                        {history.map((action) => (
                            <Card key={action.id}>
                                <div className="defense-view__row-head">
                                    <div className="defense-view__row-meta">
                                        <Badge variant={statusVariant(action.status)} size="sm" showIcon={false}>
                                            {t(`defense.status.${action.status}`)}
                                        </Badge>
                                        <Badge variant="neutral" size="sm" showIcon={false}>
                                            {t(`defense.kind.${action.kind}`)}
                                        </Badge>
                                        <span className="defense-view__row-target">{action.target}</span>
                                    </div>
                                    <span className="defense-view__row-sub">
                                        {formatTimestamp(action.executedAt)}
                                    </span>
                                </div>
                                {action.error && (
                                    <div className="defense-view__row-error">{action.error}</div>
                                )}
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

interface BlockedTabProps {
    onIntent: (intent: PendingIntent) => void;
}

function BlockedTab({ onIntent }: BlockedTabProps) {
    const { t } = useI18n();
    const { blockedIps: active } = useDefense();

    if (active.length === 0) {
        return (
            <div className="defense-view__panel">
                <EmptyState
                    icon={Ban}
                    title={t('defense.blocked.emptyTitle')}
                    message={t('defense.blocked.emptyMessage')}
                />
            </div>
        );
    }

    return (
        <div className="defense-view__panel">
            <div className="defense-view__list">
                {active.map((blocked) => (
                    <Card key={blocked.ip}>
                        <div className="defense-view__row-head">
                            <div className="defense-view__row-meta">
                                <Badge variant="danger" size="sm" showIcon={false}>
                                    {t('defense.blocked.badge')}
                                </Badge>
                                <span className="defense-view__row-target">{blocked.ip}</span>
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                icon={ShieldOff}
                                onClick={() =>
                                    onIntent({
                                        kind: 'unblock',
                                        ref: blocked.ip,
                                        title: t('defense.confirm.unblockTitle', { ip: blocked.ip }),
                                        message: t('defense.confirm.unblockMessage', { ip: blocked.ip }),
                                        destructive: false,
                                    })
                                }
                            >
                                {t('defense.blocked.unblock')}
                            </Button>
                        </div>
                        <div className="defense-view__row-sub">
                            {blocked.reason} · {formatTimestamp(blocked.blockedAt)}
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}

function CertsTab() {
    const { t, tn } = useI18n();
    const { certs } = useDefense();

    if (certs.length === 0) {
        return (
            <div className="defense-view__panel">
                <EmptyState
                    icon={Lock}
                    title={t('defense.certs.emptyTitle')}
                    message={t('defense.certs.emptyMessage')}
                />
            </div>
        );
    }

    return (
        <div className="defense-view__panel">
            <div className="defense-view__list">
                {certs.map((cert) => (
                    <Card key={cert.hostPort}>
                        <div className="defense-view__row-head">
                            <div className="defense-view__row-meta">
                                <Badge variant={certStatusVariant(cert.status)} size="sm" showIcon={false}>
                                    {t(cert.status === 'self-signed' ? 'defense.certStatus.selfSigned' : `defense.certStatus.${cert.status}`)}
                                </Badge>
                                <span className="defense-view__row-target">{cert.hostPort}</span>
                            </div>
                            <span className="defense-view__row-sub">
                                {cert.daysUntilExpiry !== null
                                    ? tn('defense.certs.expiry', cert.daysUntilExpiry)
                                    : '—'}
                            </span>
                        </div>
                        <div className="defense-view__row-sub">
                            {(cert.issuer ?? t('defense.certs.unknownIssuer'))} · {t('defense.certs.checked', { time: formatTimestamp(cert.lastChecked) })}
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}

function DefenseView() {
    const { t } = useI18n();
    const [tab, setTab] = useState<DefenseTab>('actions');
    const [intent, setIntent] = useState<PendingIntent | null>(null);
    const [upgradeOpen, setUpgradeOpen] = useState(false);
    const tier = useSettingsStore(selectTier);
    const isFree = tier === 'free';

    const { isLoading, error, dismissError } = useDefenseSync();
    const { confirmKill, confirmBlock, unblockIp } = useDefense();

    const handleConfirm = (): void => {
        if (!intent) return;
        if (intent.kind === 'kill') void confirmKill(intent.ref);
        else if (intent.kind === 'block') void confirmBlock(intent.ref);
        else void unblockIp(intent.ref);
        setIntent(null);
    };

    const handleUpgrade = (): void => {
        setUpgradeOpen(false);
        useUIStore.getState().setLicenseDialogOpen(true);
    };

    const locked = isFree && tab !== 'certs';

    return (
        <div className="defense-view page-view">
            <div className="defense-view__tabs page-toolbar" role="tablist">
                {TABS.map(({ tab: value, labelKey }) => (
                    <Button
                        key={value}
                        variant={tab === value ? 'primary' : 'ghost'}
                        size="sm"
                        role="tab"
                        aria-selected={tab === value}
                        onClick={() => setTab(value)}
                    >
                        {t(labelKey)}
                    </Button>
                ))}
            </div>

            {error && (
                <div className="defense-view__error" role="alert">
                    <span>{error}</span>
                    <button
                        type="button"
                        className="defense-view__error-dismiss"
                        aria-label={t('common.dismiss')}
                        onClick={dismissError}
                    >
                        <X size={14} strokeWidth={1.5} />
                    </button>
                </div>
            )}

            {isLoading ? (
                <div className="defense-view__loading" role="status">
                    {t('defense.loading')}
                </div>
            ) : (
                <div className={`defense-view__body${locked ? ' defense-view__lock' : ''}`}>
                    {/* inert keeps the locked panel out of the tab order, so the
                        overlay is a real gate and not just a visual one. */}
                    <div className="defense-view__scroll scrollbar-overlay" inert={locked}>
                        {tab === 'rules' && <RulesTab />}
                        {tab === 'actions' && <ActionsTab onIntent={setIntent} />}
                        {tab === 'blocked' && <BlockedTab onIntent={setIntent} />}
                        {tab === 'certs' && <CertsTab />}
                    </div>

                    {locked && (
                        <button
                            type="button"
                            className="defense-view__lock-overlay"
                            aria-label={t('defense.upgradeAria')}
                            onClick={() => setUpgradeOpen(true)}
                        >
                            <Lock size={24} strokeWidth={1.5} />
                        </button>
                    )}
                </div>
            )}

            <ConfirmDialog
                isOpen={intent !== null}
                title={intent?.title ?? ''}
                message={intent?.message ?? ''}
                confirmLabel={intent?.kind === 'unblock' ? t('defense.blocked.unblock') : t('defense.confirmAction')}
                destructive={intent?.destructive ?? false}
                onConfirm={handleConfirm}
                onCancel={() => setIntent(null)}
            />

            <UpgradePrompt
                isOpen={upgradeOpen}
                onDismiss={() => setUpgradeOpen(false)}
                onUpgrade={handleUpgrade}
            />
        </div>
    );
}

export default DefenseView;
