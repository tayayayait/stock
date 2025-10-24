import * as React from 'react';

type DivProps = React.HTMLAttributes<HTMLDivElement>;

interface CardProps extends DivProps {
  isInteractive?: boolean;
  isLoading?: boolean;
}

const baseClasses =
  'relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur transition-transform duration-150 ease-out';
const interactiveClasses =
  'cursor-pointer hover:-translate-y-1 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500';
const loadingClasses = 'animate-pulse text-transparent';

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', children, isInteractive = false, isLoading = false, onClick, onKeyDown, ...rest }, ref) => {
    const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
      onKeyDown?.(event);

      if (!isInteractive || event.defaultPrevented) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick?.(event as unknown as React.MouseEvent<HTMLDivElement, MouseEvent>);
      }
    };

    return (
      <div
        ref={ref}
        className={[
          baseClasses,
          isInteractive ? interactiveClasses : '',
          isLoading ? loadingClasses : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        role={isInteractive ? 'link' : rest.role}
        tabIndex={isInteractive ? 0 : rest.tabIndex}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        aria-busy={isLoading || undefined}
        {...rest}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = 'Card';

export default Card;
