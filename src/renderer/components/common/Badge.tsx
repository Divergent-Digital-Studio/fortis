import type { HTMLAttributes, ReactNode } from 'react';
import {
    ShieldCheck,
    Info,
    AlertTriangle,
    ShieldAlert,
    ShieldX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ThreatLevel } from '@shared/types';
import '../../styles/components/badge.css';

type BadgeVariant = ThreatLevel | 'neutral';
type BadgeSize = 'sm' | 'md' | 'lg';

const THREAT_ICONS: Record<ThreatLevel, LucideIcon> = {
    safe: ShieldCheck,
    info: Info,
    warning: AlertTriangle,
    danger: ShieldAlert,
    critical: ShieldX,
};

const ICON_SIZES: Record<BadgeSize, number> = {
    sm: 10,
    md: 12,
    lg: 14,
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant;
    size?: BadgeSize;
    showIcon?: boolean;
    icon?: LucideIcon;
    children: ReactNode;
}

function Badge({
    variant = 'neutral',
    size = 'md',
    showIcon = true,
    icon,
    children,
    className = '',
    ...rest
}: BadgeProps) {
    const iconSize = ICON_SIZES[size];
    const ResolvedIcon =
        icon ?? (variant !== 'neutral' ? THREAT_ICONS[variant] : null);

    const classes = [
        'badge',
        `badge--${variant}`,
        size !== 'md' && `badge--${size}`,
        className,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <span className={classes} {...rest}>
            {showIcon && ResolvedIcon && (
                <span className="badge__icon">
                    <ResolvedIcon size={iconSize} strokeWidth={1.5} />
                </span>
            )}
            {children}
        </span>
    );
}

export default Badge;
export type { BadgeProps, BadgeVariant, BadgeSize };
