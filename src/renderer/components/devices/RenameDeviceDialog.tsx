import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Pencil, X } from 'lucide-react';
import { Button } from '../common';
import ModalShell from '../common/ModalShell';
import { useI18n } from '../../i18n';
import '../../styles/components/rename-device-dialog.css';

interface RenameDeviceDialogProps {
    mac: string;
    initialName: string;
    fallbackHint: string;
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (mac: string, customName: string | null) => Promise<void>;
}

const MAX_NAME_LENGTH = 64;

const RenameDeviceDialog = memo(function RenameDeviceDialog({
    mac,
    initialName,
    fallbackHint,
    isOpen,
    onClose,
    onSubmit,
}: RenameDeviceDialogProps) {
    const { t } = useI18n();
    const [value, setValue] = useState(initialName);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setValue(initialName);
            setSubmitError(null);
        }
    }, [isOpen, initialName]);

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (submitting) return;
            const trimmed = value.trim().slice(0, MAX_NAME_LENGTH);
            setSubmitting(true);
            setSubmitError(null);
            try {
                await onSubmit(mac, trimmed.length > 0 ? trimmed : null);
                setSubmitting(false);
                onClose();
            } catch (err) {
                setSubmitting(false);
                setSubmitError(
                    t('devices.dialog.error', {
                        message: err instanceof Error ? err.message : String(err),
                    }),
                );
            }
        },
        [value, submitting, onSubmit, mac, onClose, t],
    );

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onClose}
            labelledBy="rename-device-title"
            overlayClassName="rename-device-dialog__overlay"
            cardClassName="rename-device-dialog__card scrollbar-overlay"
            closeDisabled={submitting}
            initialFocusRef={inputRef}
        >
            <button
                className="rename-device-dialog__close"
                onClick={onClose}
                aria-label={t('devices.dialog.closeAria')}
                type="button"
            >
                <X size={16} strokeWidth={1.5} />
            </button>

            <div className="rename-device-dialog__header">
                <div className="rename-device-dialog__icon-badge">
                    <Pencil size={20} strokeWidth={1.5} />
                </div>
                <h2 id="rename-device-title" className="rename-device-dialog__title">
                    {t('devices.dialog.title')}
                </h2>
                <p className="rename-device-dialog__hint">{fallbackHint}</p>
            </div>

            <form className="rename-device-dialog__form" onSubmit={handleSubmit}>
                <label className="rename-device-dialog__field-label" htmlFor="rename-device-input">
                    {t('devices.dialog.label')}
                </label>
                <input
                    id="rename-device-input"
                    ref={inputRef}
                    className="rename-device-dialog__input"
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={t('devices.dialog.placeholder')}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={MAX_NAME_LENGTH}
                    disabled={submitting}
                />

                {submitError && (
                    <p className="rename-device-dialog__error" role="alert">
                        <AlertCircle size={14} strokeWidth={1.5} />
                        <span>{submitError}</span>
                    </p>
                )}

                <div className="rename-device-dialog__actions">
                    <Button
                        variant="ghost"
                        size="md"
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button variant="primary" size="md" type="submit" disabled={submitting}>
                        {submitting ? t('devices.dialog.saving') : t('common.save')}
                    </Button>
                </div>
            </form>
        </ModalShell>
    );
});

export default RenameDeviceDialog;
export type { RenameDeviceDialogProps };
