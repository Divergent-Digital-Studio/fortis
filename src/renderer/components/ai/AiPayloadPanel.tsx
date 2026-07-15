import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, ShieldCheck } from 'lucide-react';
import { Button } from '../common';
import useAiPayload from '../../hooks/useAiPayload';
import type { AnonymizedPayload } from '@shared/types/analysis';
import '../../styles/components/ai-payload-dialog.css';

function formatPayload(payload: AnonymizedPayload | null): string {
    if (payload === null) return '';
    return JSON.stringify(payload, null, 2);
}

function AiPayloadPanel() {
    const { payload, isLoading, error, load } = useAiPayload();
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        void load();
    }, [load]);

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
        <section
            id="overview-ai-payload"
            className="ai-payload-panel"
            role="region"
            aria-label="AI payload preview"
        >
            <div className="ai-payload-dialog__note">
                <ShieldCheck size={14} strokeWidth={1.5} />
                <span>
                    This is the exact anonymized data that would be sent to your AI provider. It is shown here, not transmitted.
                </span>
            </div>

            {error && <p className="ai-payload-dialog__error">{error}</p>}

            <div className="ai-payload-dialog__section">
                <div className="ai-payload-dialog__section-head">
                    <span className="ai-payload-dialog__section-title">Current connections</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={copied ? Check : Copy}
                        onClick={handleCopy}
                        disabled={currentText.length === 0}
                    >
                        {copied ? 'Copied' : 'Copy'}
                    </Button>
                </div>
                <pre className="ai-payload-dialog__code scrollbar-overlay">
                    {isLoading ? 'Loading…' : currentText.length > 0 ? currentText : 'No active connections.'}
                </pre>
            </div>

            <div className="ai-payload-dialog__section">
                <span className="ai-payload-dialog__section-title">Last sent payload</span>
                <pre className="ai-payload-dialog__code scrollbar-overlay">
                    {lastSentText.length > 0 ? lastSentText : 'Nothing sent yet.'}
                </pre>
            </div>
        </section>
    );
}

export default AiPayloadPanel;
