import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import '../../styles/components/empty-state.css';

interface EmptyStateProps {
    icon?: LucideIcon;
    title?: string;
    message: string;
    action?: ReactNode;
    className?: string;
}

function EmptyState({
    icon: Icon = Inbox,
    title,
    message,
    action,
    className = '',
}: EmptyStateProps) {
    const classes = ['empty-state', className].filter(Boolean).join(' ');

    return (
        <div className={classes}>
            <div className="empty-state__icon">
                <Icon size={24} strokeWidth={1.5} />
            </div>
            {title && <h3 className="empty-state__title">{title}</h3>}
            <p className="empty-state__message">{message}</p>
            {action && <div className="empty-state__action">{action}</div>}
        </div>
    );
}

export default EmptyState;
export type { EmptyStateProps };
