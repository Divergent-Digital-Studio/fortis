import type { CSSProperties, HTMLAttributes } from 'react';
import '../../styles/components/loading-skeleton.css';

type SkeletonShape = 'rect' | 'circle' | 'rounded' | 'text';

interface LoadingSkeletonProps extends HTMLAttributes<HTMLDivElement> {
    width?: number | string;
    height?: number | string;
    shape?: SkeletonShape;
    count?: number;
}

function LoadingSkeleton({
    width = '100%',
    height = 16,
    shape = 'rect',
    count = 1,
    className = '',
    style,
    ...rest
}: LoadingSkeletonProps) {
    const resolvedWidth = typeof width === 'number' ? `${width}px` : width;
    const resolvedHeight = typeof height === 'number' ? `${height}px` : height;

    const baseStyle: CSSProperties = {
        width: resolvedWidth,
        height: resolvedHeight,
        ...style,
    };

    const classes = [
        'skeleton',
        shape !== 'rect' && `skeleton--${shape}`,
        className,
    ]
        .filter(Boolean)
        .join(' ');

    if (count === 1) {
        return <div className={classes} style={baseStyle} {...rest} />;
    }

    return (
        <div className="skeleton-group" {...rest}>
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className={classes} style={baseStyle} />
            ))}
        </div>
    );
}

export default LoadingSkeleton;
export type { LoadingSkeletonProps, SkeletonShape };
