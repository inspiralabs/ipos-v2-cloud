import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    variant: {
      neutral: 'bg-[var(--surface-2)] text-[var(--muted)]',
      primary: 'bg-[var(--primary)] text-[var(--primary-ink)]',
      accent: 'bg-[var(--accent)]/20 text-[var(--ink)]',
      warning: 'bg-[#fdf3e3] text-[#8a6a1f]',
      success: 'bg-[#eaf5ee] text-[#2f7a4d]',
      destructive: 'bg-[#fbe9e7] text-[#b23b2e]',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
