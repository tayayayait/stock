import React, { useId, useMemo } from 'react';

interface SparklineProps {
  data: number[];
  stroke?: string;
  fill?: string;
  className?: string;
  ariaLabel?: string;
}

const Sparkline: React.FC<SparklineProps> = ({
  data,
  stroke = '#6366F1',
  fill = 'rgba(99, 102, 241, 0.16)',
  className = '',
  ariaLabel,
}) => {
  const gradientId = useId();
  const { path, area, viewBox } = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) {
      return { path: '', area: '', viewBox: '0 0 100 100' };
    }

    const safeData = data.map((value) => (Number.isFinite(value) ? value : 0));
    const max = Math.max(...safeData);
    const min = Math.min(...safeData);
    const verticalRange = max - min || 1;

    const points = safeData.map((value, index) => {
      const x = (index / Math.max(safeData.length - 1, 1)) * 100;
      const y = 100 - ((value - min) / verticalRange) * 100;
      return `${x},${y}`;
    });

    const sparklinePath = `M ${points.join(' L ')}`;
    const areaPath = `M 0,100 L ${points.join(' L ')} L 100,100 Z`;

    return { path: sparklinePath, area: areaPath, viewBox: '0 0 100 100' };
  }, [data]);

  return (
    <svg
      className={`h-16 w-full ${className}`.trim()}
      viewBox={viewBox}
      preserveAspectRatio="none"
      role={ariaLabel ? 'img' : 'presentation'}
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity={0.8} />
          <stop offset="100%" stopColor={fill} stopOpacity={0} />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#${gradientId})`} stroke="none" />}
      {path && <path d={path} fill="none" stroke={stroke} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
};

export default Sparkline;
