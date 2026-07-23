import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-xl font-display font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--primary)] text-[var(--primary-ink)] hover:opacity-90',
        outline: 'border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)]',
        ghost: 'text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]',
        destructive: 'bg-[var(--status-expired)] text-[var(--status-expired-ink)] hover:opacity-90',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-sm',
        icon: 'h-9 w-9 shrink-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

type Variant = VariantProps<typeof buttonVariants>;

/** Get button classes without the <Button> component — for Radix primitives that render their own trigger element (e.g. AlertDialogAction). */
export function buttonVariantClass(variant: Variant['variant'], size: Variant['size']) {
  return buttonVariants({ variant, size });
}
