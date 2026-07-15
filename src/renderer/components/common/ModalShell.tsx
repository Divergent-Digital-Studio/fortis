import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface ModalShellProps {
    isOpen: boolean;
    onClose: () => void;
    labelledBy: string;
    overlayClassName: string;
    cardClassName: string;
    closeDisabled?: boolean;
    initialFocusRef?: RefObject<HTMLElement | null>;
    children: ReactNode;
}

function ModalShell({
    isOpen,
    onClose,
    labelledBy,
    overlayClassName,
    cardClassName,
    closeDisabled = false,
    initialFocusRef,
    children,
}: ModalShellProps) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    const handleOverlayClick = useCallback(
        (e: React.MouseEvent) => {
            if (closeDisabled) return;
            if (e.target === overlayRef.current) onClose();
        },
        [onClose, closeDisabled],
    );

    const handleTabTrap = useCallback((e: KeyboardEvent) => {
        if (e.key !== 'Tab' || !cardRef.current) return;
        const focusables = cardRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const previousFocus = document.activeElement as HTMLElement | null;
        return () => {
            if (previousFocus && typeof previousFocus.focus === 'function') {
                previousFocus.focus();
            }
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !closeDisabled) onClose();
        };
        document.addEventListener('keydown', handleEscape);
        document.addEventListener('keydown', handleTabTrap);
        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.removeEventListener('keydown', handleTabTrap);
        };
    }, [isOpen, onClose, closeDisabled, handleTabTrap]);

    useEffect(() => {
        if (!isOpen) return;
        const timer = setTimeout(() => {
            (initialFocusRef?.current ?? cardRef.current)?.focus();
        }, 50);
        return () => clearTimeout(timer);
    }, [isOpen, initialFocusRef]);

    if (!isOpen) return null;

    return createPortal(
        <div
            className={overlayClassName}
            ref={overlayRef}
            onClick={handleOverlayClick}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
        >
            <div className={cardClassName} ref={cardRef} tabIndex={-1}>
                {children}
            </div>
        </div>,
        document.body,
    );
}

export default ModalShell;
export type { ModalShellProps };
