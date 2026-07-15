import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Eye } from 'lucide-react';
import { Button } from '../common';
import { useI18n } from '../../i18n';
import type { ThreatIntelSubmission } from '@shared/types/m7';
import type { ThreatLevel } from '@shared/types/analysis';

interface ThreatIntelPayloadPanelProps {
    preview: () => Promise<ThreatIntelSubmission[]>;
    severityFloor: ThreatLevel;
}

function ThreatIntelPayloadPanel({ preview, severityFloor }: ThreatIntelPayloadPanelProps) {
    const { t } = useI18n();
    const [items, setItems] = useState<ThreatIntelSubmission[]>([]);
    const [copied, setCopied] = useState(false);

    // Re-preview whenever the floor changes — the main process filters by the
    // persisted floor, so a stale panel would misreport what gets shared.
    useEffect(() => {
        let active = true;
        preview()
            .then((next) => {
                if (active) setItems(next);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [preview, severityFloor]);

    const formatted = JSON.stringify(items, null, 2);

    const handleCopy = useCallback(() => {
        void navigator.clipboard.writeText(formatted).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        });
    }, [formatted]);

    return (
        <section className="community-preview" role="region" aria-label={t('community.preview')}>
            <div className="community-preview__head">
                <span className="community-preview__title">
                    <Eye size={16} strokeWidth={1.5} aria-hidden="true" /> {t('community.preview')}
                </span>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCopy}
                    aria-label={t('community.copy')}
                    disabled={items.length === 0}
                >
                    {copied ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : <Copy size={14} strokeWidth={1.5} aria-hidden="true" />}
                    {copied ? t('community.copied') : t('community.copy')}
                </Button>
            </div>
            <p className="community-preview__hint">{t('community.previewHint')}</p>
            {items.length === 0 ? (
                <p className="community-preview__empty">{t('community.previewEmpty')}</p>
            ) : (
                <pre className="community-preview__json scrollbar-overlay" tabIndex={0}>
                    {formatted}
                </pre>
            )}
        </section>
    );
}

export default ThreatIntelPayloadPanel;
