import { CupSoda, UtensilsCrossed, IceCreamCone, Sandwich, Package } from 'lucide-react';

// ponytail: mapping literal per kata kunci nama kategori — cukup untuk kategori khas UMKM
// F&B (makanan/minuman/snack/dessert). Tidak perlu i18n key table untuk 4 kata.
const ICON_MAP: Array<{ match: RegExp; icon: typeof Package }> = [
  { match: /minum|drink|kopi|jus/i, icon: CupSoda },
  { match: /makan|nasi|food/i, icon: UtensilsCrossed },
  { match: /dessert|manis|es\s/i, icon: IceCreamCone },
  { match: /snack|cemilan/i, icon: Sandwich },
];

export function CategoryIcon({ categoryName, className }: { categoryName?: string; className?: string }) {
  const match = categoryName ? ICON_MAP.find((m) => m.match.test(categoryName)) : undefined;
  const Icon = match?.icon ?? Package;
  return <Icon className={className ?? 'h-4 w-4'} />;
}
