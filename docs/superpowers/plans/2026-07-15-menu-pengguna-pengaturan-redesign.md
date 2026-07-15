# Menu, Pengguna, Pengaturan Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert three list-based pages (`/menu`, `/kasir` [staff management], `/pengaturan` hub) to icon-driven grid layouts, add a reusable `Avatar` component (photo-or-initials fallback), and extend Profil Toko with logo upload + address/phone fields.

**Architecture:** Each page keeps its existing data-fetching logic (`apiFetch` + `useState`/`useEffect`) untouched; only the JSX rendering changes from `<ul><li>` lists to CSS grid of `Card`-based tiles. A shared `Avatar` component is built once and used by both the staff grid and the Profil Toko logo. Backend changes are two small additions to `packages/drizzle-schema/src/tenant.ts` and `services/tenant-service/src/routes/tenant/me.ts` (new `address`/`phone` columns) — logo file upload itself has no storage backend yet, so the uploader UI is built with local-preview-only behavior and an explicit flag comment for the missing endpoint.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind v4, existing `components/ui/*` primitives, `framer-motion` (added in the Kasir redesign plan — this plan assumes it's already installed; if run independently, see Task 1 for the install step).

## Global Constraints

- All new interactive elements ≥44×44px touch target.
- Reuse `Card`, `Button`, `Badge`, `Field`, `Input` from `components/ui/*` — do not duplicate their styling inline.
- All grid reveal animations respect `prefers-reduced-motion` (see Task 2's `prefersReducedMotion` pattern, reused from the Kasir plan).
- Bahasa Indonesia for all user-facing copy.
- `pnpm --filter tenant-app type-check` must pass after every task.
- Backend schema/route changes require `pnpm --filter @ipos-cloud/drizzle-schema type-check` and `pnpm --filter tenant-service type-check` to pass.

---

### Task 1: Ensure framer-motion is installed

**Files:**
- Modify: `ipos-cloud/apps/tenant-app/package.json` (only if not already present)

- [ ] **Step 1: Check if framer-motion is already a dependency**

Run: `cd ipos-cloud/apps/tenant-app && cat package.json | grep framer-motion`
Expected: if the Kasir redesign plan already ran, this prints `"framer-motion": "^11.15.0",`. If so, skip to Task 2.

- [ ] **Step 2: Add it if missing**

If not present, edit `ipos-cloud/apps/tenant-app/package.json`, inside `"dependencies"`:

```json
    "framer-motion": "^11.15.0",
```

Run: `cd ipos-cloud && pnpm install --filter tenant-app`

- [ ] **Step 3: Commit (only if a change was made)**

```bash
cd ipos-cloud
git add apps/tenant-app/package.json pnpm-lock.yaml
git commit -m "chore(tenant-app): add framer-motion dependency"
```

---

### Task 2: Build the Avatar component

**Files:**
- Create: `ipos-cloud/apps/tenant-app/components/Avatar.tsx`

**Interfaces:**
- Consumes: none beyond React.
- Produces: `<Avatar name={string} imageUrl={string | null} size="sm" | "md" | "lg" />` — renders an `<img>` if `imageUrl` is set, otherwise a circle with the name's initials on a `--primary`-tinted background. Used by both `StaffCard` (Task 4) and `LogoUploader`/Profil Toko (Task 6).

- [ ] **Step 1: Write the component**

```tsx
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
```

Note: using plain `<img>` rather than `next/image` — the source URLs are arbitrary user-uploaded/external URLs not configured in `next.config.ts`'s image domains allowlist, and this project doesn't currently use `next/image` anywhere else (verified: no `next/image` import exists in the codebase), so introducing it here would require also touching `next.config.ts` for a single component. Plain `<img>` matches existing conventions.

- [ ] **Step 2: Verify it compiles**

Run: `cd ipos-cloud/apps/tenant-app && pnpm type-check`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ipos-cloud
git add apps/tenant-app/components/Avatar.tsx
git commit -m "feat(tenant-app): add Avatar component with initials fallback"
```

---

### Task 3: Convert Menu page to icon-driven grid

**Files:**
- Create: `ipos-cloud/apps/tenant-app/components/menu/CategoryIcon.tsx`
- Create: `ipos-cloud/apps/tenant-app/components/menu/MenuCard.tsx`
- Modify: `ipos-cloud/apps/tenant-app/app/(dashboard)/menu/page.tsx:114-179` (the list rendering block)

**Interfaces:**
- Consumes: `Menu`, `Category` types from `@/lib/types`; `Badge` from `@/components/ui/badge`.
- Produces: `<CategoryIcon categoryName={string | undefined} className={string} />`; `<MenuCard menu={Menu} groupCount={number} categoryName={string | undefined} onToggleSoldOut={() => void} onEdit={() => void} onDelete={() => void} />`.

- [ ] **Step 1: Write CategoryIcon**

```tsx
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
```

- [ ] **Step 2: Write MenuCard**

```tsx
'use client';

import { motion } from 'framer-motion';
import { Pencil, Trash2, EyeOff, Eye, UtensilsCrossed } from 'lucide-react';
import type { Menu } from '@/lib/types';
import { formatRupiah } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { CategoryIcon } from './CategoryIcon';

export function MenuCard({
  menu,
  groupCount,
  categoryName,
  onToggleSoldOut,
  onEdit,
  onDelete,
}: {
  menu: Menu;
  groupCount: number;
  categoryName?: string;
  onToggleSoldOut: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div layout className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div className="relative flex h-28 items-center justify-center bg-[var(--surface-2)]">
        {menu.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={menu.image_url} alt={menu.name} className="h-full w-full object-cover" />
        ) : (
          <UtensilsCrossed className="h-8 w-8 text-[var(--muted)]" />
        )}
        <div className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface)]/90 text-[var(--ink)] shadow-sm">
          <CategoryIcon categoryName={categoryName} className="h-3.5 w-3.5" />
        </div>
        {menu.is_sold_out && (
          <div className="absolute right-2 top-2">
            <Badge variant="destructive">HABIS</Badge>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            aria-label="Ubah menu"
            onClick={onEdit}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink)] active:scale-95"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={menu.is_sold_out ? 'Tandai tersedia' : 'Tandai habis'}
            onClick={onToggleSoldOut}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink)] active:scale-95"
          >
            {menu.is_sold_out ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label="Hapus menu"
            onClick={onDelete}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface)] text-red-500 active:scale-95"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-semibold text-[var(--ink)]">{menu.name}</p>
        <div className="mt-1 flex items-center gap-1.5">
          {menu.discount_price != null ? (
            <>
              <span className="text-xs text-[var(--muted)] line-through">{formatRupiah(menu.price)}</span>
              <span className="text-sm font-bold text-[var(--primary)]">{formatRupiah(menu.discount_price)}</span>
            </>
          ) : (
            <span className="text-sm font-bold text-[var(--ink)]">{formatRupiah(menu.price)}</span>
          )}
        </div>
        {groupCount > 0 && <p className="mt-1 text-xs text-[var(--muted)]">{groupCount} variasi</p>}
      </div>
    </motion.div>
  );
}
```

Note: action buttons are revealed via `opacity-0`/`group-hover:opacity-100` — on touch devices without hover, `group-focus-within:opacity-100` ensures a tap-to-focus still reveals them (tapping the card area focuses nothing by default, so Step 3 below also adds a persistent low-opacity state on mobile as a fallback — see the `sm:opacity-0` note).

Actually, for touch devices where hover never fires, always-visible-but-subtle is more reliable than hover-only. Revise the overlay className to be visible by default on small screens and hover-gated only on `md:` and up:

```tsx
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-100 transition-opacity md:bg-black/50 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
```

Use this corrected version instead of the first overlay className above.

- [ ] **Step 3: Replace the list rendering in menu/page.tsx**

In `app/(dashboard)/menu/page.tsx`, replace the `byCategory.map(...)` block (lines ~125-177) with a grid layout. Replace:

```tsx
          byCategory.map(({ category, items }) => (
            <section key={category?.id ?? 'uncat'} className="mb-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                {category?.name ?? 'Tanpa Kategori'}
              </h2>
              <ul className="space-y-2">
                {items.map((menu) => {
                  const groupCount = links.filter((l) => l.menu_id === menu.id).length;
                  return (
                    <li ...>
                      {/* ...existing list item markup... */}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
```

With:

```tsx
          byCategory.map(({ category, items }) => (
            <section key={category?.id ?? 'uncat'} className="mb-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                {category?.name ?? 'Tanpa Kategori'}
              </h2>
              <motion.div
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
              >
                {items.map((menu) => {
                  const groupCount = links.filter((l) => l.menu_id === menu.id).length;
                  return (
                    <motion.div
                      key={menu.id}
                      variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                    >
                      <MenuCard
                        menu={menu}
                        groupCount={groupCount}
                        categoryName={category?.name}
                        onToggleSoldOut={() => toggleSoldOut(menu)}
                        onEdit={() => setEditing(menu)}
                        onDelete={() => setRemoving(menu)}
                      />
                    </motion.div>
                  );
                })}
              </motion.div>
            </section>
          ))
```

Add the imports at the top of `menu/page.tsx`:

```tsx
import { motion } from 'framer-motion';
import { MenuCard } from '@/components/menu/MenuCard';
```

- [ ] **Step 4: Verify in browser**

Run: `pnpm --filter tenant-app dev`, open `/menu`. Confirm: grid renders 2 columns on narrow width, 3-4 on wider; category icon badge shows in the top-left of each card; sold-out items show a red "HABIS" badge top-right; hovering (desktop) or the default subtle overlay (mobile) reveals edit/toggle/delete icon buttons; cards stagger in on load.

- [ ] **Step 5: Run type-check**

Run: `cd ipos-cloud/apps/tenant-app && pnpm type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd ipos-cloud
git add apps/tenant-app/components/menu/ apps/tenant-app/app/\(dashboard\)/menu/page.tsx
git commit -m "feat(menu): convert list to icon-driven grid with hover/tap action overlay"
```

---

### Task 4: Convert staff page (Pengguna) to grid with Avatar

**Files:**
- Create: `ipos-cloud/apps/tenant-app/components/pengguna/StaffCard.tsx`
- Modify: `ipos-cloud/apps/tenant-app/app/(dashboard)/kasir/page.tsx:83-113` (the list rendering block)

**Interfaces:**
- Consumes: `Avatar` from `@/components/Avatar`, the existing `Cashier` type defined inline in `kasir/page.tsx:18`.
- Produces: `<StaffCard cashier={Cashier} onResetPassword={() => void} onToggleActive={() => void} onDelete={() => void} />`.

- [ ] **Step 1: Write StaffCard**

```tsx
'use client';

import { motion } from 'framer-motion';
import { KeyRound, UserX, UserCheck, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/ui/badge';

type Cashier = { id: string; name: string; email: string; role: string; is_active: boolean };

export function StaffCard({
  cashier,
  onResetPassword,
  onToggleActive,
  onDelete,
}: {
  cashier: Cashier;
  onResetPassword: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div layout className="group relative flex flex-col items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center shadow-sm">
      <Avatar name={cashier.name} size="lg" />
      <div>
        <p className="truncate text-sm font-semibold text-[var(--ink)]">{cashier.name}</p>
        <p className="truncate text-xs text-[var(--muted)]">{cashier.email}</p>
      </div>
      {!cashier.is_active && <Badge variant="neutral">Nonaktif</Badge>}
      <div className="flex w-full items-center justify-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <button
          type="button"
          aria-label="Reset password"
          onClick={onResetPassword}
          className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink)] hover:bg-[var(--surface-2)] active:scale-95"
        >
          <KeyRound className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={cashier.is_active ? 'Nonaktifkan' : 'Aktifkan'}
          onClick={onToggleActive}
          className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink)] hover:bg-[var(--surface-2)] active:scale-95"
        >
          {cashier.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
        </button>
        <button
          type="button"
          aria-label="Hapus kasir"
          onClick={onDelete}
          className="flex h-11 w-11 items-center justify-center rounded-full text-red-500 hover:bg-red-500/10 active:scale-95"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Replace the list rendering in kasir/page.tsx**

Replace the `<ul className="space-y-2">...</ul>` block (lines ~87-111) with:

```tsx
          <motion.div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
          >
            {cashiers.map((c) => (
              <motion.div key={c.id} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
                <StaffCard
                  cashier={c}
                  onResetPassword={() => setResetting(c)}
                  onToggleActive={() => toggleActive(c)}
                  onDelete={() => setRemoving(c)}
                />
              </motion.div>
            ))}
          </motion.div>
```

Add imports:

```tsx
import { motion } from 'framer-motion';
import { StaffCard } from '@/components/pengguna/StaffCard';
```

- [ ] **Step 3: Verify in browser**

Run: `pnpm --filter tenant-app dev`, open `/kasir`. Confirm: staff render as a grid of cards with large initials-avatars (no photo upload exists yet, so all avatars show initials), inactive staff show a "Nonaktif" badge, action buttons work the same as before (reset password, toggle active, delete).

- [ ] **Step 4: Run type-check**

Run: `cd ipos-cloud/apps/tenant-app && pnpm type-check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd ipos-cloud
git add apps/tenant-app/components/pengguna/ apps/tenant-app/app/\(dashboard\)/kasir/page.tsx
git commit -m "feat(pengguna): convert staff list to grid cards with Avatar initials"
```

---

### Task 5: Convert Pengaturan hub to icon grid

**Files:**
- Modify: `ipos-cloud/apps/tenant-app/app/(dashboard)/pengaturan/page.tsx`

**Interfaces:**
- Consumes: existing `Card` from `@/components/ui/card`.
- Produces: same `ITEMS` data, new grid rendering.

- [ ] **Step 1: Rewrite the page**

Replace the full contents of `app/(dashboard)/pengaturan/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Store, Printer, QrCode, Bell, CreditCard, Palette } from 'lucide-react';
import { Card } from '@/components/ui/card';

const ITEMS = [
  { href: '/pengaturan/profil', label: 'Profil Toko', desc: 'Nama, alamat, logo toko', icon: Store },
  { href: '/pengaturan/printer', label: 'Printer', desc: 'Sambungkan printer struk', icon: Printer },
  { href: '/pengaturan/qris', label: 'QRIS', desc: 'Kelola pembayaran QRIS', icon: QrCode },
  { href: '/pengaturan/notifikasi', label: 'Notifikasi', desc: 'Pengingat & pemberitahuan', icon: Bell },
  { href: '/pengaturan/billing', label: 'Paket & Tagihan', desc: 'Plan aktif, upgrade paket', icon: CreditCard },
  { href: '/pengaturan/tema', label: 'Tema', desc: 'Warna tampilan toko', icon: Palette },
];

export default function PengaturanPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-[var(--ink)]">Pengaturan</h1>
      <motion.div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
      >
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <motion.div key={item.href} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
              <Link href={item.href}>
                <Card className="flex min-h-[140px] flex-col items-center justify-center gap-2 p-6 text-center transition-colors hover:bg-[var(--surface-2)] active:scale-[0.98]">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
                    <Icon className="h-7 w-7 text-[var(--ink)]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">{item.label}</p>
                    <p className="text-xs text-[var(--muted)]">{item.desc}</p>
                  </div>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Run: `pnpm --filter tenant-app dev`, open `/pengaturan`. Confirm: 1 column on mobile, 2 on tablet, 3 on desktop; each tile is a centered icon+label+description box; tiles stagger in on load; clicking navigates to the correct subpage (unchanged hrefs).

- [ ] **Step 3: Run type-check**

Run: `cd ipos-cloud/apps/tenant-app && pnpm type-check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd ipos-cloud
git add apps/tenant-app/app/\(dashboard\)/pengaturan/page.tsx
git commit -m "feat(pengaturan): convert hub from list-of-cards to icon grid"
```

---

### Task 6: Add address/phone columns to tenants schema and tenant-service

**Files:**
- Modify: `ipos-cloud/packages/drizzle-schema/src/tenant.ts`
- Modify: `ipos-cloud/services/tenant-service/src/routes/tenant/me.ts`

**Interfaces:**
- Consumes: existing `tenants` Drizzle table definition.
- Produces: `tenants.address` (text, nullable), `tenants.phone` (varchar 20, nullable) columns; `GET /me` returns them; `PATCH /me` accepts them.

- [ ] **Step 1: Add columns to the schema**

In `ipos-cloud/packages/drizzle-schema/src/tenant.ts`, find the `tenants` table definition (around line 4-20). After the `theme_color` line, add:

```ts
  theme_color: varchar('theme_color', { length: 10 }).notNull().default('4'),
  address: text('address'),
  phone: varchar('phone', { length: 20 }),
```

(Only add `address` and `phone` — `theme_color` already exists from a prior session; this shows it as an anchor point so the diff location is unambiguous.)

- [ ] **Step 2: Update GET /me response**

In `ipos-cloud/services/tenant-service/src/routes/tenant/me.ts`, find the `GET /me` return object (lines 19-31). Add `address` and `phone` after `theme_color`:

```ts
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan_code,
      status: tenant.status,
      trial_ends_at: tenant.trial_ends_at,
      logo_url: tenant.logo_url,
      timezone: tenant.timezone,
      setup_completed_at: tenant.setup_completed_at,
      theme_color: tenant.theme_color,
      address: tenant.address,
      phone: tenant.phone,
      user,
    };
```

- [ ] **Step 3: Update PATCH /me schema**

In the same file, find the `PATCH /me` zod schema (lines 35-42). Add:

```ts
    const body = z.object({
      name: z.string().min(2).optional(),
      logo_url: z.string().url().nullable().optional(),
      timezone: z.string().optional(),
      setup_completed: z.boolean().optional(),
      theme_color: z.string().max(10).optional(),
      address: z.string().max(500).nullable().optional(),
      phone: z.string().max(20).nullable().optional(),
    }).parse(request.body);
```

- [ ] **Step 4: Type-check both packages**

Run: `cd ipos-cloud/packages/drizzle-schema && pnpm type-check`
Expected: no errors.

Run: `cd ipos-cloud/services/tenant-service && pnpm type-check`
Expected: no errors.

- [ ] **Step 5: Generate the migration**

Run: `cd ipos-cloud/packages/drizzle-schema && pnpm db:generate`
Expected: a new SQL migration file is created adding `address` and `phone` columns to `tenants`. (Requires `DATABASE_URL` in the package's environment — if not configured in this environment, note the command for the user to run themselves; do not skip documenting it.)

- [ ] **Step 6: Commit**

```bash
cd ipos-cloud
git add packages/drizzle-schema/src/tenant.ts packages/drizzle-schema/drizzle/ services/tenant-service/src/routes/tenant/me.ts
git commit -m "feat(tenant): add address and phone columns to tenants table"
```

---

### Task 7: Update the Tenant frontend type

**Files:**
- Modify: `ipos-cloud/apps/tenant-app/lib/types.ts:77-90`

**Interfaces:**
- Consumes: none.
- Produces: `Tenant` type gains `address: string | null` and `phone: string | null`, matching the new `GET /me` response.

- [ ] **Step 1: Update the Tenant type**

In `ipos-cloud/apps/tenant-app/lib/types.ts`, find the `Tenant` type (lines 78-90). Add two fields:

```ts
export type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  trial_ends_at: string | null;
  logo_url: string | null;
  timezone: string;
  setup_completed_at: string | null;
  theme_color: string;
  address: string | null;
  phone: string | null;
  user: { id: string; name: string; email: string; role: string };
};
```

- [ ] **Step 2: Run type-check**

Run: `cd ipos-cloud/apps/tenant-app && pnpm type-check`
Expected: no errors (existing consumers of `Tenant` don't destructure exhaustively, so adding fields is non-breaking).

- [ ] **Step 3: Commit**

```bash
cd ipos-cloud
git add apps/tenant-app/lib/types.ts
git commit -m "feat(tenant-app): add address/phone to Tenant type"
```

---

### Task 8: Build LogoUploader component

**Files:**
- Create: `ipos-cloud/apps/tenant-app/components/pengaturan/LogoUploader.tsx`

**Interfaces:**
- Consumes: `Avatar` from `@/components/Avatar`.
- Produces: `<LogoUploader currentUrl={string | null} storeName={string} onFileSelected={(file: File) => void} />` — click-to-upload with local `URL.createObjectURL` preview. Does NOT call any upload API (none exists yet) — `onFileSelected` is provided so the parent (Task 9) can wire it to a real endpoint once one exists; until then, the parent's handler can be a no-op that just shows a toast explaining upload isn't live yet.

- [ ] **Step 1: Write LogoUploader**

```tsx
'use client';

import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Avatar } from '@/components/Avatar';

// ponytail: tidak ada endpoint upload storage di backend (Supabase Storage/S3) saat ini —
// komponen ini hanya menampilkan preview lokal via URL.createObjectURL dan meneruskan
// File terpilih ke onFileSelected. Sambungkan ke endpoint upload nyata begitu tersedia;
// sampai saat itu, parent boleh no-op + toast "belum tersedia".
export function LogoUploader({
  currentUrl,
  storeName,
  onFileSelected,
}: {
  currentUrl: string | null;
  storeName: string;
  onFileSelected: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    onFileSelected(file);
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative flex h-24 w-24 items-center justify-center rounded-full active:scale-95"
        aria-label="Ganti logo toko"
      >
        <Avatar name={storeName} imageUrl={previewUrl ?? currentUrl} size="lg" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-colors group-hover:bg-black/40">
          <Camera className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <div className="text-sm text-[var(--muted)]">
        <p className="font-medium text-[var(--ink)]">Logo Toko</p>
        <p>Klik untuk ganti foto. JPG/PNG, maks 2MB.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd ipos-cloud/apps/tenant-app && pnpm type-check`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ipos-cloud
git add apps/tenant-app/components/pengaturan/LogoUploader.tsx
git commit -m "feat(pengaturan): add LogoUploader with local preview (upload endpoint pending backend)"
```

---

### Task 9: Wire LogoUploader, address, and phone into Profil Toko

**Files:**
- Modify: `ipos-cloud/apps/tenant-app/app/(dashboard)/pengaturan/profil/page.tsx`

**Interfaces:**
- Consumes: `LogoUploader` (Task 8), existing `apiFetch`, `useTenant`, `Field`, `Input`, `Button`, `Card*`.
- Produces: updated Profil Toko page with logo section (preview-only), address, and phone fields, submitted via the extended `PATCH /me`.

- [ ] **Step 1: Rewrite the page**

Replace the full contents of `app/(dashboard)/pengaturan/profil/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/auth';
import { useTenant } from '@/components/layout/TenantContext';
import { LogoUploader } from '@/components/pengaturan/LogoUploader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ProfilPage() {
  const { tenant, refetch } = useTenant();
  const [name, setName] = useState(tenant.name);
  const [address, setAddress] = useState(tenant.address ?? '');
  const [phone, setPhone] = useState(tenant.phone ?? '');
  const [saving, setSaving] = useState(false);

  function handleLogoSelected(file: File) {
    // Endpoint upload logo belum ada di backend — beri tahu owner tanpa gagal diam-diam.
    toast.info('Upload logo akan tersedia setelah fitur penyimpanan file selesai dibangun.');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/v1/tenants/me', {
        method: 'PATCH',
        body: JSON.stringify({ name, address: address || null, phone: phone || null }),
      });
      await refetch();
      toast.success('Profil toko disimpan');
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Profil Toko</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <LogoUploader currentUrl={tenant.logo_url} storeName={tenant.name} onFileSelected={handleLogoSelected} />
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nama toko">
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Alamat" hint="Opsional">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Jl. Contoh No. 1" />
            </Field>
            <Field label="No HP" hint="Opsional">
              <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" />
            </Field>
            <Button type="submit" disabled={saving || !name}>
              {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Run: `pnpm --filter tenant-app dev`, open `/pengaturan/profil`. Confirm: logo circle shows store-name initials (no logo uploaded yet), clicking it opens a file picker and shows a local preview image, a toast explains upload isn't wired to a backend yet. Fill address/phone, submit, confirm success toast and that a page refresh preserves the saved values (via `GET /me`).

- [ ] **Step 3: Run type-check**

Run: `cd ipos-cloud/apps/tenant-app && pnpm type-check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd ipos-cloud
git add apps/tenant-app/app/\(dashboard\)/pengaturan/profil/page.tsx
git commit -m "feat(pengaturan/profil): add logo uploader preview, address, and phone fields"
```

---

### Task 10: Full production build verification

**Files:** none (verification only)

- [ ] **Step 1: Run production build**

Run: `cd ipos-cloud/apps/tenant-app && pnpm build`
Expected: build completes with no errors; `/menu`, `/kasir`, `/pengaturan`, `/pengaturan/profil` all listed in the route output.

- [ ] **Step 2: Manual smoke test across breakpoints**

Run: `pnpm start`, open each of the four routes at 375px, 834px, and 1280px widths. Confirm grids reflow correctly at each breakpoint and no layout overflows.

- [ ] **Step 3: Commit (if any fixes were needed)**

```bash
cd ipos-cloud
git add -A
git commit -m "fix: address build/verification issues from Menu/Pengguna/Pengaturan redesign"
```

(Skip this commit if no changes were needed.)
