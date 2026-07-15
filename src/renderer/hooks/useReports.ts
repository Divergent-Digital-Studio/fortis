import { useState, useEffect, useCallback } from 'react';
import { useReportStore } from '../stores/report-store';
import type { WeeklyReport, ReportExportFormat } from '@shared/types/m2';

interface UseReportsResult {
    reports: WeeklyReport[];
    isLoading: boolean;
    isGenerating: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    generate: (periodDays?: number) => Promise<void>;
    exportReport: (id: string, format: ReportExportFormat) => Promise<void>;
}

const EXTENSIONS: Record<ReportExportFormat, string> = {
    json: 'json',
    markdown: 'md',
    html: 'html',
    csv: 'csv',
    pdf: 'pdf',
};

const MIME_TYPES: Record<ReportExportFormat, string> = {
    json: 'application/json',
    markdown: 'text/markdown',
    html: 'text/html',
    csv: 'text/csv',
    pdf: 'application/pdf',
};

function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

function downloadString(content: string, filename: string, mime: string): void {
    triggerDownload(new Blob([content], { type: mime }), filename);
}

function downloadBase64(b64: string, filename: string, mime: string): void {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    triggerDownload(new Blob([bytes], { type: mime }), filename);
}

function useReports(): UseReportsResult {
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const reports = useReportStore((s) => s.reports);
    const setReports = useReportStore((s) => s.setReports);

    const fetchReports = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data = await window.fortis.getReports();
            setReports(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch reports');
        } finally {
            setIsLoading(false);
        }
    }, [setReports]);

    useEffect(() => {
        fetchReports();
        const unsubscribe = window.fortis.onReportsUpdate((data) => {
            setReports(data);
        });
        return unsubscribe;
    }, [fetchReports, setReports]);

    const generate = useCallback(async (periodDays?: number) => {
        try {
            setIsGenerating(true);
            setError(null);
            await window.fortis.generateReport(periodDays);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate report');
        } finally {
            setIsGenerating(false);
        }
    }, []);

    const exportReport = useCallback(async (id: string, format: ReportExportFormat) => {
        try {
            const content = await window.fortis.exportReport(id, format);
            if (content.length === 0) {
                setError('Export failed: report not found or empty');
                return;
            }
            const filename = `fortis-report-${id}.${EXTENSIONS[format]}`;
            if (format === 'pdf') {
                downloadBase64(content, filename, MIME_TYPES.pdf);
            } else {
                downloadString(content, filename, MIME_TYPES[format]);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to export report');
        }
    }, []);

    return { reports, isLoading, isGenerating, error, refresh: fetchReports, generate, exportReport };
}

export default useReports;
export type { UseReportsResult };
