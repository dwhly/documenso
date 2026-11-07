import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '../lib/utils';

// Fleet design system: status = bordered, tinted pill in a fixed status role (DESIGN.md §3).
const badgeVariants = cva('inline-flex items-center rounded-sm border text-xs font-medium w-fit', {
  variants: {
    variant: {
      neutral: 'border-neutral-border bg-neutral-subtle text-neutral',
      destructive: 'border-danger-border bg-danger-subtle text-danger',
      warning: 'border-warning-border bg-warning-subtle text-warning',
      default: 'border-success-border bg-success-subtle text-success',
      secondary: 'border-info-border bg-info-subtle text-info',
      orange: 'border-warning-border bg-warning-subtle text-warning',
    },
    size: {
      small: 'px-1.5 py-0.5 text-xs',
      default: 'px-2 py-1.5 text-xs',
      large: 'px-3 py-2 text-sm',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div role="status" className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
