import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, X, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from './index';
import ModalShell from './ModalShell';
import useLicense from '../../hooks/useLicense';
import { useI18n } from '../../i18n';
import { TIER_LABELS } from '@shared/types/ipc';
import '../../styles/components/license-dialog.css';

interface LicenseDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

const LicenseDialog = memo(function LicenseDialog({ isOpen, onClose }: LicenseDialogProps) {
    const { t, locale } = useI18n();
    const { status, activate, openPurchase } = useLicense();
    const [keyInput, setKeyInput] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setFeedback(null);
            setKeyInput('');
        }
    }, [isOpen]);

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!keyInput.trim() || submitting) return;
            setSubmitting(true);
            setFeedback(null);
            const result = await activate(keyInput.trim());
            setSubmitting(false);
            if (result.success) {
                setFeedback({ ok: true, message: t('license.activated') });
                setKeyInput('');
            } else {
                setFeedback({ ok: false, message: result.error ?? t('license.activateFailed') });
            }
        },
        [keyInput, submitting, activate, t],
    );

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onClose}
            labelledBy="license-dialog-title"
            overlayClassName="license-dialog__overlay"
            cardClassName="license-dialog__card scrollbar-overlay"
            closeDisabled={submitting}
            initialFocusRef={inputRef}
        >
            <button
                className="license-dialog__close"
                onClick={onClose}
                aria-label={t('license.closeAria')}
                type="button"
            >
                <X size={16} strokeWidth={1.5} />
            </button>

            <div className="license-dialog__header">
                <div className="license-dialog__icon-badge">
                    <KeyRound size={20} strokeWidth={1.5} />
                </div>
                <h2 id="license-dialog-title" className="license-dialog__title">
                    {t('license.title')}
                </h2>
            </div>

            <div className="license-dialog__current">
                <span className="license-dialog__current-label">{t('license.currentPlan')}</span>
                <span className={`license-dialog__current-tier license-dialog__current-tier--${status.tier}`}>
                    {TIER_LABELS[status.tier]}
                    {status.valid && <CheckCircle2 size={14} strokeWidth={2} className="license-dialog__ok-icon" />}
                </span>
                {status.valid && status.expiresAt && (
                    <span className="license-dialog__current-expiry">
                        {t('license.validUntil', {
                            date: new Date(status.expiresAt).toLocaleDateString(locale),
                        })}
                    </span>
                )}
                {status.valid && !status.expiresAt && (
                    <span className="license-dialog__current-expiry">{t('license.noExpiry')}</span>
                )}
            </div>

            <form className="license-dialog__form" onSubmit={handleSubmit}>
                <label className="license-dialog__field-label" htmlFor="license-key-input">
                    {t('license.keyLabel')}
                </label>
                <input
                    id="license-key-input"
                    ref={inputRef}
                    className="license-dialog__input"
                    type="text"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="FORTIS-LICENSE-V1-..."
                    autoComplete="off"
                    spellCheck={false}
                    disabled={submitting}
                />

                {feedback && (
                    <div
                        className={`license-dialog__feedback license-dialog__feedback--${feedback.ok ? 'ok' : 'error'}`}
                        role={feedback.ok ? 'status' : 'alert'}
                    >
                        {feedback.ok ? (
                            <CheckCircle2 size={14} strokeWidth={2} />
                        ) : (
                            <AlertCircle size={14} strokeWidth={2} />
                        )}
                        <span>{feedback.message}</span>
                    </div>
                )}

                <Button
                    variant="primary"
                    size="lg"
                    type="submit"
                    disabled={!keyInput.trim() || submitting}
                    className="license-dialog__submit"
                >
                    {submitting ? t('license.activating') : t('license.activate')}
                </Button>
            </form>

            <div className="license-dialog__footer">
                <span className="license-dialog__footer-text">{t('license.noLicense')}</span>
                <button
                    className="license-dialog__purchase-link"
                    onClick={openPurchase}
                    type="button"
                >
                    {t('license.buy')} <ExternalLink size={12} strokeWidth={2} />
                </button>
            </div>
        </ModalShell>
    );
});

export default LicenseDialog;
export type { LicenseDialogProps };
