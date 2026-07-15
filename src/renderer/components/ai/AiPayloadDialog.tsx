import { useCallback, useEffect, useState } from 'react';
import { X, Copy, Check, ShieldCheck, Eye } from 'lucide-react';
import { Button } from '../common';
import ModalShell from '../common/ModalShell';
import useAiPayload from '../../hooks/useAiPayload';
import { useI18n } from '../../i18n';
import type { AnonymizedPayload } from '@shared/types/analysis';
import '../../styles/components/ai-payload-dialog.css';

interface AiPayloadDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

function formatPayload(payload: AnonymizedPayload | null): string {
    if (payload === null) return '';
    return JSON.stringify(payload, null, 2);
}

function AiPayloadDialog({ isOpen, onClose }: AiPayloadDialogProps) {
    const { t } = useI18n();
    const { payload, isLoading, error, load } = useAiPayload();
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (isOpen) {
            void load();
            setCopied(false);
        }
    }, [isOpen, load]);

    const handleCopy = useCallback(async () => {
        const text = formatPayload(payload?.current ?? null);
        if (text.length === 0) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopied(false);
        }
    }, [payload]);

    const currentText = formatPayload(payload?.current ?? null);
    const lastSentText = formatPayload(payload?.lastSent ?? null);

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onClose}
            labelledBy="ai-payload-title"
            overlayClassName="ai-payload-dialog__overlay"
            cardClassName="ai-payload-dialog__card scrollbar-overlay"
        >
            <button
                className="ai-payload-dialog__close"
                onClick={onClose}
                aria-label={t('aiPayload.closeAria')}
                type="button"
            >
                <X size={16} strokeWidth={1.5} />
            </button>

            <div className="ai-payload-dialog__header">
                <Eye size={18} strokeWidth={1.5} />
                <h2 id="ai-payload-title" className="ai-payload-dialog__title">{t('aiPayload.title')}</h2>
            </div>

            <div className="ai-payload-dialog__note">
                <ShieldCheck size={14} strokeWidth={1.5} />
                <span>{t('aiPayload.note')}</span>
            </div>

            {error && <p className="ai-payload-dialog__error">{error}</p>}

            <div className="ai-payload-dialog__section">
                <div className="ai-payload-dialog__section-head">
                    <span className="ai-payload-dialog__section-title">{t('aiPayload.currentTitle')}</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={copied ? Check : Copy}
                        onClick={handleCopy}
                        disabled={currentText.length === 0}
                    >
                        {copied ? t('aiPayload.copied') : t('aiPayload.copy')}
                    </Button>
                </div>
                <pre className="ai-payload-dialog__code scrollbar-overlay">
                    {isLoading ? t('aiPayload.loading') : currentText.length > 0 ? currentText : t('aiPayload.empty')}
                </pre>
            </div>

            <div className="ai-payload-dialog__section">
                <span className="ai-payload-dialog__section-title">{t('aiPayload.lastSentTitle')}</span>
                <pre className="ai-payload-dialog__code scrollbar-overlay">
                    {lastSentText.length > 0 ? lastSentText : t('aiPayload.nothingSent')}
                </pre>
            </div>
        </ModalShell>
    );
}

export default AiPayloadDialog;
export type { AiPayloadDialogProps };
