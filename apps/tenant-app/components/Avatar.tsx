function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SIZE_CLASSES = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-14 w-14 text-lg',
  lg: 'h-24 w-24 text-3xl',
} as const;

export function Avatar({
  name,
  imageUrl,
  size = 'md',
}: {
  name: string;
  imageUrl?: string | null;
  size?: keyof typeof SIZE_CLASSES;
}) {
  const sizeClass = SIZE_CLASSES[size];
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={name} className={`${sizeClass} rounded-full object-cover`} />;
  }
  return (
    <div
      className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full bg-[var(--primary)] font-bold text-[var(--primary-ink)]`}
      aria-label={name}
    >
      {getInitials(name)}
    </div>
  );
}
