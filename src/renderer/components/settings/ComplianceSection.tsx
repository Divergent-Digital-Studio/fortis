import { useCallback, useId, useMemo, useState } from 'react';
import { FileCheck, Info } from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Select from '../common/Select';
import DataTable from '../common/DataTable';
import type { Column } from '../common/DataTable';
import useSettings from '../../hooks/useSettings';
import useAdmin from '../../hooks/useAdmin';
import type { ComplianceControl, ComplianceFramework, ComplianceReport, ControlStatus } from '@shared/types/m6';
import { useI18n } from '../../i18n';

const FRAMEWORK_OPTIONS: ReadonlyArray<{ value: ComplianceFramework; label: string }> = [
    { value: 'soc2', label: 'SOC 2' },
    { value: 'iso27001', label: 'ISO 27001' },
    { value: 'pci', label: 'PCI DSS' },
    { value: 'hipaa', label: 'HIPAA' },
    { value: 'gdpr', label: 'GDPR' },
];

function statusVariant(status: ControlStatus): 'safe' | 'warning' | 'danger' | 'neutral' {
    if (status === 'pass') return 'safe';
    if (status === 'warn') return 'warning';
    if (status === 'fail') return 'danger';
    return 'neutral';
}

function downloadBase64Pdf(b64: string, filename: string): void {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

function ComplianceSection() {
    const { t } = useI18n();
    const orgId = useId();
    const colorId = useId();

    const { settings, updateSettings } = useSettings();
    const { session } = useAdmin();

    const [framework, setFramework] = useState<ComplianceFramework>('soc2');
    const [report, setReport] = useState<ComplianceReport | null>(null);
    const [generating, setGenerating] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const controlColumns = useMemo<ReadonlyArray<Column<ComplianceControl>>>(() => [
        { key: 'title', header: t('settings.compliance.control'), sortValue: (c) => c.title },
        {
            key: 'status',
            header: t('settings.compliance.status'),
            width: '8rem',
            sortValue: (c) => c.status,
            render: (c) => <Badge variant={statusVariant(c.status)}>{t(`settings.compliance.controlStatus.${c.status}`)}</Badge>,
        },
    ], [t]);

    const handleGenerate = useCallback(async () => {
        const token = session?.token ?? '';
        setGenerating(true);
        setError(null);
        try {
            const result = await window.fortis.generateCompliance(token, framework);
            setReport(result);
        } catch {
            setReport(null);
            setError('settings.compliance.generateFailed');
        } finally {
            setGenerating(false);
        }
    }, [session, framework]);

    const handleExportPdf = useCallback(async () => {
        const token = session?.token ?? '';
        setExporting(true);
        setError(null);
        try {
            const b64 = await window.fortis.exportCompliancePdf(token, framework);
            if (b64.length > 0) downloadBase64Pdf(b64, `fortis-compliance-${framework}.pdf`);
            else setError('settings.compliance.exportNoData');
        } catch {
            setError('settings.compliance.exportFailed');
        } finally {
            setExporting(false);
        }
    }, [session, framework]);

    return (
        <Card
            header={
                <div className="settings-section__header">
                    <FileCheck size={18} strokeWidth={1.5} className="settings-section__icon" />
                    <span className="settings-section__title">{t('settings.compliance.title')}</span>
                </div>
            }
        >
            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label className="settings-field__label">{t('settings.compliance.framework')}</label>
                    <span className="settings-field__hint">{t('settings.compliance.frameworkHint')}</span>
                </div>
                <div className="settings-field__control">
                    <Select
                        value={framework}
                        options={FRAMEWORK_OPTIONS}
                        onChange={setFramework}
                        ariaLabel={t('settings.compliance.frameworkAria')}
                    />
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={orgId} className="settings-field__label">{t('settings.compliance.orgName')}</label>
                    <span className="settings-field__hint">{t('settings.compliance.orgNameHint')}</span>
                </div>
                <div className="settings-field__control">
                    <input
                        id={orgId}
                        type="text"
                        className="settings-input"
                        placeholder="Acme Inc."
                        value={settings.complianceOrgName}
                        onChange={(e) => updateSettings({ complianceOrgName: e.target.value })}
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={colorId} className="settings-field__label">{t('settings.compliance.accentColor')}</label>
                    <span className="settings-field__hint">{t('settings.compliance.accentColorHint')}</span>
                </div>
                <div className="settings-field__control">
                    <input
                        id={colorId}
                        type="color"
                        className="settings-input"
                        value={settings.complianceAccentColor}
                        onChange={(e) => updateSettings({ complianceAccentColor: e.target.value })}
                    />
                </div>
            </div>

            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label className="settings-field__label">{t('settings.compliance.generateReport')}</label>
                    <span className="settings-field__hint">{t('settings.compliance.generateHint')}</span>
                </div>
                <div className="settings-field__control">
                    <div className="settings-input-group">
                        <Button variant="primary" size="sm" onClick={handleGenerate} disabled={generating}>
                            {generating ? t('settings.compliance.generating') : t('settings.compliance.generate')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handleExportPdf} disabled={exporting}>
                            {exporting ? t('settings.compliance.exporting') : t('settings.compliance.exportPdf')}
                        </Button>
                    </div>
                </div>
            </div>

            {error && <p className="settings-field__error settings-field__message">{t(error)}</p>}

            {report && (
                <>
                    <div className="settings-field">
                        <div className="settings-field__label-group">
                            <label className="settings-field__label">{t('settings.compliance.summary')}</label>
                            <span className="settings-field__hint">{report.orgName}</span>
                        </div>
                        <div className="settings-field__control">
                            <div className="settings-input-group">
                                <Badge variant="safe">{t('settings.compliance.passCount', { count: report.summary.pass })}</Badge>
                                <Badge variant="warning">{t('settings.compliance.warnCount', { count: report.summary.warn })}</Badge>
                                <Badge variant="danger">{t('settings.compliance.failCount', { count: report.summary.fail })}</Badge>
                                <Badge variant="neutral">{t('settings.compliance.naCount', { count: report.summary.na })}</Badge>
                            </div>
                        </div>
                    </div>
                    <DataTable
                        rows={report.controls}
                        columns={controlColumns}
                        rowKey={(c) => c.id}
                        label={t('settings.compliance.tableLabel')}
                        emptyMessage={t('settings.compliance.tableEmpty')}
                    />
                </>
            )}

            <div className="settings-note">
                <Info size={14} strokeWidth={1.5} className="settings-note__icon" />
                <span className="settings-note__text">
                    {t('settings.compliance.note')}
                </span>
            </div>
        </Card>
    );
}

export default ComplianceSection;
