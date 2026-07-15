import { X } from 'lucide-react';
import Button from './Button';
import ModalShell from './ModalShell';
import { useI18n } from '../../i18n';
import '../../styles/components/confirm-dialog.css';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmLabel,
    cancelLabel,
    destructive = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const { t } = useI18n();

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onCancel}
            labelledBy="confirm-dialog-title"
            overlayClassName="confirm-dialog__overlay"
            cardClassName="confirm-dialog__card scrollbar-overlay"
        >
            <button
                className="confirm-dialog__close"
                onClick={onCancel}
                aria-label={t('common.closeDialog')}
                type="button"
            >
                <X size={16} />
            </button>
            <h2 id="confirm-dialog-title" className="confirm-dialog__title">
                {title}
            </h2>
            <p className="confirm-dialog__message">{message}</p>
            <div className="confirm-dialog__actions">
                <Button variant="secondary" onClick={onCancel}>
                    {cancelLabel ?? t('common.cancel')}
                </Button>
                <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>
                    {confirmLabel ?? t('common.confirm')}
                </Button>
            </div>
        </ModalShell>
    );
}
