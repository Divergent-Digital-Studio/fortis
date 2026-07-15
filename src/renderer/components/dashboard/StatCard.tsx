import { memo, useRef, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import '../../styles/components/stats.css';

type IconVariant = 'default' | 'safe' | 'warning' | 'info';

interface StatCardProps {
    icon: LucideIcon;
    value: string | number;
    label: string;
    variant?: IconVariant;
}

const StatCard = memo(function StatCard({
    icon: Icon,
    value,
    label,
    variant = 'default',
}: StatCardProps) {
    const [shouldAnimate, setShouldAnimate] = useState(false);
    const prevValueRef = useRef(value);

    useEffect(() => {
        if (prevValueRef.current !== value) {
            setShouldAnimate(true);
            prevValueRef.current = value;

            const timer = setTimeout(() => setShouldAnimate(false), 250);
            return () => clearTimeout(timer);
        }
    }, [value]);

    const valueClasses = [
        'stat-card__value',
        shouldAnimate && 'stat-card__value--animate',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className="stat-card">
            <div className={`stat-card__icon stat-card__icon--${variant}`}>
                <Icon size={18} strokeWidth={1.5} />
            </div>
            <div className="stat-card__content">
                <span className={valueClasses}>{value}</span>
                <span className="stat-card__label">{label}</span>
            </div>
        </div>
    );
});

export default StatCard;
export type { StatCardProps, IconVariant };
