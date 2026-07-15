import { useMemo, useState } from 'react';
import { FileText, Download, RefreshCw, Loader2, Lock } from 'lucide-react';
import { Button, Badge, Card, EmptyState, Select } from '../common';
import { useSettingsStore, selectTier } from '../../stores';
import { useI18n } from '../../i18n';
import useReports from '../../hooks/useReports';
import type { WeeklyReport, ReportExportFormat } from '@shared/types/m2';
import '../../styles/components/reports-view.css';

const FREE_TIER_VISIBLE = 1;

type PeriodValue = '7' | '30' | '90';

const PERIOD_OPTIONS: ReadonlyArray<{ value: PeriodValue; labelKey: string }> = [
    { value: '7', labelKey: 'reports.period.last7' },
    { value: '30', labelKey: 'reports.period.last30' },
    { value: '90', labelKey: 'reports.period.last90' },
];

const EXPORT_FORMATS: ReadonlyArray<{ format: ReportExportFormat; label: string }> = [
    { format: 'json', label: 'JSON' },
    { format: 'markdown', label: 'Markdown' },
    { format: 'html', label: 'HTML' },
    { format: 'csv', label: 'CSV' },
    { format: 'pdf', label: 'PDF' },
];

function formatPeriod(report: WeeklyReport): string {
    const start = new Date(report.periodStart).toLocaleDateString();
    const end = new Date(report.periodEnd).toLocaleDateString();
    return `${start} – ${end}`;
}

function healthVariant(score: number | null): 'safe' | 'warning' | 'danger' | 'neutral' {
    if (score === null) return 'neutral';
    if (score >= 80) return 'safe';
    if (score >= 50) return 'warning';
    return 'danger';
}

function ReportCard({ report, onExport }: { report: WeeklyReport; onExport: (id: string, format: ReportExportFormat) => void }) {
    const { t } = useI18n();
    return (
        <Card>
            <div className="reports-view__card-head">
                <div className="reports-view__card-meta">
                    <span className="reports-view__period">{formatPeriod(report)}</span>
                    <Badge variant={healthVariant(report.healthScore)} size="sm" showIcon={false}>
                        {report.healthScore === null
                            ? t('reports.noScore')
                            : t('reports.health', { score: report.healthScore })}
                    </Badge>
                    <Badge variant="neutral" size="sm" showIcon={false}>
                        {report.generatedBy === 'ai' ? t('reports.generatedBy.ai') : t('reports.generatedBy.local')}
                    </Badge>
                </div>
                <div className="reports-view__exports">
                    {EXPORT_FORMATS.map(({ format, label }) => (
                        <Button
                            key={format}
                            variant="ghost"
                            size="sm"
                            icon={Download}
                            onClick={() => onExport(report.id, format)}
                        >
                            {label}
                        </Button>
                    ))}
                </div>
            </div>
            <p className="reports-view__summary">{report.summary}</p>
            <div className="reports-view__stats">
                <span>{t('reports.stats.threats', { count: report.threatCount })}</span>
                <span>{t('reports.stats.newDevices', { count: report.newDeviceCount })}</span>
                <span>{t('reports.stats.topProcess', { name: report.topProcesses[0]?.name ?? t('reports.stats.none') })}</span>
            </div>
        </Card>
    );
}

function ReportsView() {
    const { t, tn } = useI18n();
    const { reports, isLoading, isGenerating, error, generate, exportReport } = useReports();
    const tier = useSettingsStore(selectTier);
    const isFree = tier === 'free';
    const [period, setPeriod] = useState<PeriodValue>('7');

    const { visible, lockedCount } = useMemo(() => {
        if (!isFree) return { visible: reports, lockedCount: 0 };
        return { visible: reports.slice(0, FREE_TIER_VISIBLE), lockedCount: Math.max(0, reports.length - FREE_TIER_VISIBLE) };
    }, [reports, isFree]);

    return (
        <div className="reports-view">
            <div className="reports-view__toolbar">
                <span className="reports-view__count">{tn('reports.count', reports.length)}</span>
                <Select
                    value={period}
                    options={PERIOD_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
                    onChange={setPeriod}
                    ariaLabel={t('reports.periodAria')}
                    disabled={isGenerating}
                    className="reports-view__period-select"
                />
                <Button
                    variant="primary"
                    size="sm"
                    icon={isGenerating ? Loader2 : RefreshCw}
                    onClick={() => generate(Number(period))}
                    disabled={isGenerating}
                >
                    {isGenerating ? t('reports.generating') : t('reports.generate')}
                </Button>
            </div>

            {error && <p className="reports-view__error">{error}</p>}

            {reports.length === 0 ? (
                <EmptyState
                    icon={FileText}
                    title={isLoading ? t('reports.empty.loadingTitle') : t('reports.empty.title')}
                    message={isLoading ? t('reports.empty.loadingMessage') : t('reports.empty.message')}
                />
            ) : (
                <div className="reports-view__list">
                    {visible.map((report) => (
                        <ReportCard key={report.id} report={report} onExport={exportReport} />
                    ))}
                    {lockedCount > 0 && (
                        <Card>
                            <div className="reports-view__locked">
                                <Lock size={18} strokeWidth={1.5} />
                                <div>
                                    <p className="reports-view__locked-title">{tn('reports.locked', lockedCount)}</p>
                                    <p className="reports-view__locked-text">
                                        {t('reports.lockedText')}
                                    </p>
                                </div>
                            </div>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
}

export default ReportsView;
