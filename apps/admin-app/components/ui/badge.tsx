import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-display font-semibold uppercase tracking-wide',
  {
    variants: {
      tone: {
        trial: 'bg-[var(--status-trial)] text-[var(--status-trial-ink)]',
        active: 'bg-[var(--status-active)] text-[var(--status-active-ink)]',
        expired: 'bg-[var(--status-expired)] text-[var(--status-expired-ink)]',
        progress: 'bg-[var(--accent)] text-[var(--accent-ink)]',
        // inactive/revoked renders as an outline, not a fill — quieter on purpose, the "nothing to do here" state
        inactive: 'border border-[var(--border)] text-[var(--muted)]',
      },
    },
    defaultVariants: { tone: 'inactive' },
  }
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export type BadgeTone = NonNullable<BadgeProps['tone']>;
