import type { HTMLAttributes, ReactNode } from 'react';
import '../../styles/components/card.css';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    header?: ReactNode;
    headerActions?: ReactNode;
    hoverable?: boolean;
    compact?: boolean;
    flush?: boolean;
    children: ReactNode;
}

function Card({
    header,
    headerActions,
    hoverable = false,
    compact = false,
    flush = false,
    children,
    className = '',
    ...rest
}: CardProps) {
    const classes = [
        'card',
        hoverable && 'card--hoverable',
        compact && 'card--compact',
        flush && 'card--flush',
        className,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={classes} {...rest}>
            {header && (
                <div className="card__header">
                    <div className="card__header-title">{header}</div>
                    {headerActions && (
                        <div className="card__header-actions">
                            {headerActions}
                        </div>
                    )}
                </div>
            )}
            <div className="card__body">{children}</div>
        </div>
    );
}

export default Card;
export type { CardProps };
