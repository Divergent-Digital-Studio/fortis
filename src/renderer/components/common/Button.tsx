import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import '../../styles/components/button.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const ICON_SIZES: Record<ButtonSize, number> = {
    sm: 14,
    md: 16,
    lg: 18,
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: LucideIcon;
    iconRight?: LucideIcon;
    iconOnly?: boolean;
    children?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            variant = 'primary',
            size = 'md',
            icon: IconLeft,
            iconRight: IconRight,
            iconOnly = false,
            children,
            className = '',
            disabled,
            ...rest
        },
        ref,
    ) => {
        const iconSize = ICON_SIZES[size];

        const classes = [
            'btn',
            `btn--${variant}`,
            `btn--${size}`,
            iconOnly && 'btn--icon-only',
            className,
        ]
            .filter(Boolean)
            .join(' ');

        return (
            <button
                ref={ref}
                className={classes}
                disabled={disabled}
                {...rest}
            >
                {IconLeft && (
                    <span className="btn__icon">
                        <IconLeft size={iconSize} strokeWidth={1.5} />
                    </span>
                )}
                {!iconOnly && children}
                {IconRight && (
                    <span className="btn__icon">
                        <IconRight size={iconSize} strokeWidth={1.5} />
                    </span>
                )}
            </button>
        );
    },
);

Button.displayName = 'Button';

export default Button;
export type { ButtonProps, ButtonVariant, ButtonSize };
