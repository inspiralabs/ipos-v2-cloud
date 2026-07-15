# Kasir (POS) Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Kasir/POS cart panel (`ipos-cloud/apps/tenant-app/app/pos/page.tsx`) so it's fast to tap on a tablet: bigger qty controls, a dedicated delete button, per-item notes, a quick customer-add flow, a table-number field, and framer-motion feedback on every cart interaction.

**Architecture:** Everything is scoped to `app/pos/page.tsx` and new presentational components under `components/pos/`. No route changes. The backend already accepts `table_number` in `POST /api/v1/pos/orders` (verified in `services/pos-service/src/index.ts:104`) — only the frontend needs to send it. Motion is added via `framer-motion`, a new dependency; Radix `Popover` is a new primitive following the existing `dialog.tsx`/`sheet.tsx` wrapper pattern.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind v4, Radix UI primitives + CVA (existing `components/ui/`), `framer-motion` (new), `@radix-ui/react-popover` (new).

## Global Constraints

- All new interactive elements (buttons, swatches, stepper controls) must be ≥44×44px (project-wide touch-target rule, see `DESIGN.md` "Do" list).
- All motion must respect `prefers-reduced-motion` — fall back to instant/crossfade, never skip the reduced-motion branch.
- Reuse existing UI primitives (`Button`, `Input`, `Modal`, `Dialog`) — do not reinvent typography, spacing, or color; always reference CSS custom properties (`var(--primary)`, etc.), never hardcode hex.
- Bahasa Indonesia for all user-facing copy (labels, placeholders, toasts), matching the existing file's voice.
- `pnpm --filter tenant-app type-check` must pass after every task that touches `tenant-app`.

---

### Task 1: Install framer-motion and @radix-ui/react-popover

**Files:**
- Modify: `ipos-cloud/apps/tenant-app/package.json`

**Interfaces:**
- Produces: `framer-motion` package available for import as `motion`, `AnimatePresence` from `'framer-motion'`; `@radix-ui/react-popover` available as `PopoverPrimitive` from `'@radix-ui/react-popover'`.

- [ ] **Step 1: Add dependencies to package.json**

Edit `ipos-cloud/apps/tenant-app/package.json`, inside `"dependencies"` (alphabetical order, matching existing style):

```json
    "@radix-ui/react-alert-dialog": "^1.1.19",
    "@radix-ui/react-dialog": "^1.1.19",
    "@radix-ui/react-label": "^2.1.11",
    "@radix-ui/react-popover": "^1.1.6",
    "@radix-ui/react-select": "^2.3.3",
    "@radix-ui/react-switch": "^1.1.3",
    "@radix-ui/react-tabs": "^1.1.3",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "framer-motion": "^11.15.0",
    "lucide-react": "^0.395.0",
```

- [ ] **Step 2: Install**

Run: `cd ipos-cloud && pnpm install --filter tenant-app`
Expected: installs `framer-motion` and `@radix-ui/react-popover` with no errors.

- [ ] **Step 3: Verify import resolves**

Run: `cd ipos-cloud/apps/tenant-app && pnpm type-check`
Expected: no new errors (package.json change alone doesn't add code yet, this just confirms install didn't break anything).

- [ ] **Step 4: Commit**

```bash
cd ipos-cloud
git add apps/tenant-app/package.json apps/tenant-app/package-lock.json pnpm-lock.yaml
git commit -m "chore(tenant-app): add framer-motion and radix popover for Kasir redesign"
```

(If `package-lock.json` doesn't exist or isn't tracked, omit it — the project uses pnpm; only add `pnpm-lock.yaml` if it changed.)

---

### Task 2: Build the Popover UI primitive

**Files:**
- Create: `ipos-cloud/apps/tenant-app/components/ui/popover.tsx`

**Interfaces:**
- Consumes: `@radix-ui/react-popover`, `cn` from `@/lib/utils`.
- Produces: `Popover`, `PopoverTrigger`, `PopoverContent` — same export shape as `dialog.tsx`'s `Dialog`/`DialogTrigger`/`DialogContent`, so later tasks can use it identically.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export const PopoverContent = forwardRef<
  ElementRef<typeof PopoverPrimitive.Content>,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-72 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl outline-none',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
```

Note: the `animate-in`/`fade-in-0`/`zoom-in-95` classes are Tailwind's built-in data-attribute animation utilities (already available in Tailwind v4 core, no plugin needed) — not framer-motion. Popover open/close stays CSS-driven; framer-motion is reserved for the cart-specific interactions in later tasks.

- [ ] **Step 2: Verify it compiles**

Run: `cd ipos-cloud/apps/tenant-app && pnpm type-check`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ipos-cloud
git add apps/tenant-app/components/ui/popover.tsx
git commit -m "feat(tenant-app): add Popover UI primitive"
```

---

### Task 3: Add table_number and item notes to POS page state

**Files:**
- Modify: `ipos-cloud/apps/tenant-app/app/pos/page.tsx:15-27` (state declarations), `app/pos/page.tsx:127-166` (`submitOrder`)

**Interfaces:**
- Consumes: existing `CartLine` type from `@/lib/types` (already has `notes: string | null`).
- Produces: new `tableNumber` state (string), `submitOrder` now sends `table_number` in the POST body (field already accepted server-side per `services/pos-service/src/index.ts:104`).

- [ ] **Step 1: Add tableNumber state**

In `app/pos/page.tsx`, after the existing state declarations (after `const [sandboxLimitMsg, setSandboxLimitMsg] = useState('');`), add:

```tsx
  const [tableNumber, setTableNumber] = useState('');
```

- [ ] **Step 2: Send table_number in submitOrder**

Find the `submitOrder` function (around line 127) and the `apiFetch('/api/v1/pos/orders', ...)` call inside it. Add `table_number: tableNumber || null,` to the JSON body, right after the `customer_name` line:

```tsx
          customer_id: customer?.id ?? null,
          customer_name: customer?.name ?? null,
          table_number: tableNumber || null,
```

Also reset it on successful submit, in the same block where `setCart([])` and `setPayOpen(false)` are called:

```tsx
      setCart([]);
      setPayOpen(false);
      setTableNumber('');
```

- [ ] **Step 3: Verify manually with a test order**

Run: `cd ipos-cloud/apps/tenant-app && pnpm dev` (port 3100), open `/pos`, open a shift, add an item, open browser devtools Network tab, submit a cash payment. Confirm the `POST /api/v1/pos/orders` request body includes `"table_number": null` (UI for setting it comes in Task 5).

- [ ] **Step 4: Run type-check**

Run: `cd ipos-cloud/apps/tenant-app && pnpm type-check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd ipos-cloud
git add apps/tenant-app/app/pos/page.tsx
git commit -m "feat(pos): wire table_number into order submission"
```

---

### Task 4: Build QtyStepper component (44px buttons + delete button)

**Files:**
- Create: `ipos-cloud/apps/tenant-app/components/pos/QtyStepper.tsx`
- Modify: `ipos-cloud/apps/tenant-app/app/pos/page.tsx` (cart line rendering, around lines 242-270)

**Interfaces:**
- Consumes: none beyond React/framer-motion.
- Produces: `<QtyStepper qty={number} onIncrement={() => void} onDecrement={() => void} onRemove={() => void} />` — a self-contained row of 3 controls (−, qty display, +) plus a separate delete button, replacing the inline `-`/`+` buttons currently in `pos/page.tsx`.

- [ ] **Step 1: Write QtyStepper**

```tsx
'use client';

import { motion } from 'framer-motion';
import { Minus, Plus, Trash2 } from 'lucide-react';

export function QtyStepper({
  qty,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  qty: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        aria-label="Kurangi"
        onClick={onDecrement}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)] active:scale-95"
      >
        <Minus className="h-4 w-4" />
      </button>
      <motion.span
        key={qty}
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-6 text-center text-sm font-semibold text-[var(--ink)]"
      >
        {qty}
      </motion.span>
      <button
        type="button"
        aria-label="Tambah"
        onClick={onIncrement}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)] active:scale-95"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Hapus item"
        onClick={onRemove}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10 active:scale-95"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
```

Note on the `motion.span` with `key={qty}`: changing `key` forces React to remount the span each time `qty` changes, so `animate` re-runs from `initial` every time — this is what produces the "pulse on every tap" effect rather than animating once and freezing.

- [ ] **Step 2: Replace inline qty buttons in pos/page.tsx**

In `app/pos/page.tsx`, find the cart line rendering block (the `<li>` inside the cart `<ul>`, currently rendering two raw `<button>` elements with `−`/`+` at lines ~252-268). Replace the whole `<div className="flex shrink-0 items-center gap-2">...</div>` block with:

```tsx
                    <QtyStepper
                      qty={line.qty}
                      onIncrement={() => changeQty(line.line_id, 1)}
                      onDecrement={() => changeQty(line.line_id, -1)}
                      onRemove={() => setCart((prev) => prev.filter((l) => l.line_id !== line.line_id))}
                    />
```

Add the import at the top of the file:

```tsx
import { QtyStepper } from '../../components/pos/QtyStepper';
```

- [ ] **Step 3: Verify in browser**

Run: `pnpm --filter tenant-app dev`, open `/pos`, add an item to cart. Confirm: qty buttons are visibly bigger (44px), tapping +/- shows a brief scale-pulse on the number, the trash icon removes the line immediately without needing to hold `-`.

- [ ] **Step 4: Run type-check**

Run: `cd ipos-cloud/apps/tenant-app && pnpm type-check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd ipos-cloud
git add apps/tenant-app/components/pos/QtyStepper.tsx apps/tenant-app/app/pos/page.tsx
git commit -m "feat(pos): replace qty +/- with 44px QtyStepper and dedicated delete button"
```

---

### Task 5: Add cart header — TableNumberField and CustomerQuickAdd

**Files:**
- Create: `ipos-cloud/apps/tenant-app/components/pos/TableNumberField.tsx`
- Create: `ipos-cloud/apps/tenant-app/components/pos/CustomerQuickAdd.tsx`
- Modify: `ipos-cloud/apps/tenant-app/app/pos/page.tsx` (cart panel header, around line 236-238)

**Interfaces:**
- Consumes: `Popover`/`PopoverTrigger`/`PopoverContent` from Task 2, `Input`/`Button`/`Field` from `@/components/ui/*`, `apiFetch` from `@/lib/auth`, `Customer` type from `@/lib/types`.
- Produces: `<TableNumberField value={string} onChange={(v: string) => void} />`; `<CustomerQuickAdd customer={Customer | null} onPick={(c: Customer) => void} onOpenFullPicker={() => void} />`. `CustomerQuickAdd` POSTs to `/api/v1/tenants/customers` (existing endpoint, already used by `CustomerPicker` in `pos/page.tsx:573`).

- [ ] **Step 1: Write TableNumberField**

```tsx
'use client';

import { Input } from '@/components/ui/input';

export function TableNumberField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="No Meja"
      className="h-11 w-24 text-center text-sm"
      aria-label="Nomor meja"
    />
  );
}
```

- [ ] **Step 2: Write CustomerQuickAdd**

```tsx
'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/auth';
import type { Customer } from '@/lib/types';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function CustomerQuickAdd({
  customer,
  onPick,
  onOpenFullPicker,
}: {
  customer: Customer | null;
  onPick: (c: Customer) => void;
  onOpenFullPicker: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const row = await apiFetch('/api/v1/tenants/customers', {
        method: 'POST',
        body: JSON.stringify({ name, phone: phone || null }),
      });
      onPick(row);
      setOpen(false);
      setName('');
      setPhone('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-11">
          {customer ? customer.name : 'Pelanggan'}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <form onSubmit={quickAdd} className="space-y-3">
          <Field label="Nama">
            <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama pelanggan" />
          </Field>
          <Field label="No HP" hint="Opsional">
            <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" disabled={saving || !name} className="w-full">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </Button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenFullPicker();
            }}
            className="w-full text-center text-xs text-[var(--muted)] underline underline-offset-2"
          >
            Cari pelanggan lain
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
```

Note: `PopoverTrigger asChild` requires the child (`Button`) to forward its ref — `Button` in `components/ui/button.tsx` is already built with `forwardRef`, so this works without modification.

- [ ] **Step 3: Wire both into the cart panel header in pos/page.tsx**

In `app/pos/page.tsx`, find the cart `<aside>` block (line ~236). Immediately after the opening `<aside ...>` tag and before the existing `<div className="flex-1 overflow-y-auto p-4">`, add a new header row:

```tsx
          <div className="flex items-center gap-2 border-b border-[var(--border)] p-3">
            <TableNumberField value={tableNumber} onChange={setTableNumber} />
            <CustomerQuickAdd
              customer={customer}
              onPick={setCustomer}
              onOpenFullPicker={() => setPickCustomerFromHeader(true)}
            />
          </div>
```

This introduces two new pieces of state that need to live in the parent `PosPage` component (not `PaymentModal`, since the header is now visible before payment): move `customer` state up. Add near the other `useState` declarations in `PosPage`:

```tsx
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pickCustomerFromHeader, setPickCustomerFromHeader] = useState(false);
```

Update `submitOrder`'s call site — the payment flow already threads a `customer` parameter through `PaymentModal`'s `onConfirm`; change `PaymentModal` to receive the lifted `customer` as a prop instead of managing its own, OR (simpler, smaller diff) leave `PaymentModal`'s internal customer state as the source of truth for the *payment step*, and only use the header's `CustomerQuickAdd` to pre-fill `PaymentModal`'s default. Take the smaller-diff option: pass `initialCustomer={customer}` to `PaymentModal` and have `PaymentModal`'s `useState<Customer | null>` initialize from it:

```tsx
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer);
```

(add `initialCustomer: Customer | null` to `PaymentModal`'s props type, and pass `initialCustomer={customer}` at its call site `{payOpen && <PaymentModal total={subtotal} initialCustomer={customer} onClose={...} onConfirm={submitOrder} />}`).

Add the imports:

```tsx
import { TableNumberField } from '../../components/pos/TableNumberField';
import { CustomerQuickAdd } from '../../components/pos/CustomerQuickAdd';
```

- [ ] **Step 4: Verify in browser**

Run: `pnpm --filter tenant-app dev`, open `/pos`. Confirm: table number field and "Pelanggan" button appear at the top of the cart panel. Tap "Pelanggan", fill name, save — button label updates to the customer's name. Tap "Cari pelanggan lain" — full `CustomerPicker` modal opens.

- [ ] **Step 5: Run type-check**

Run: `cd ipos-cloud/apps/tenant-app && pnpm type-check`
Expected: no errors. Fix any prop-type mismatches from the `PaymentModal` prop change.

- [ ] **Step 6: Commit**

```bash
cd ipos-cloud
git add apps/tenant-app/components/pos/TableNumberField.tsx apps/tenant-app/components/pos/CustomerQuickAdd.tsx apps/tenant-app/app/pos/page.tsx
git commit -m "feat(pos): add table number field and customer quick-add popover to cart header"
```

---

### Task 6: Build ItemNoteEditor (Popover on tablet/desktop, Sheet on mobile)

**Files:**
- Create: `ipos-cloud/apps/tenant-app/components/pos/ItemNoteEditor.tsx`
- Modify: `ipos-cloud/apps/tenant-app/app/pos/page.tsx` (cart line rendering)

**Interfaces:**
- Consumes: `Popover`/`PopoverContent` (Task 2), `Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle` from `@/components/ui/sheet` (existing), `CartLine.notes`.
- Produces: `<ItemNoteEditor note={string | null} onSave={(note: string) => void} />` — renders as Popover on `md:`/`landscape:` breakpoints, Sheet below that, using CSS visibility toggling (both rendered, one hidden) rather than a JS media-query hook, matching the project's existing dual-variant Tailwind pattern (`landscape:`/`md:`).

- [ ] **Step 1: Write ItemNoteEditor**

```tsx
'use client';

import { useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

function NoteForm({ note, onSave, onDone }: { note: string | null; onSave: (n: string) => void; onDone: () => void }) {
  const [draft, setDraft] = useState(note ?? '');
  return (
    <div className="space-y-3">
      <textarea
        autoFocus
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Catatan untuk item ini, mis. tanpa bawang"
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <Button
        className="w-full"
        onClick={() => {
          onSave(draft);
          onDone();
        }}
      >
        Simpan Catatan
      </Button>
    </div>
  );
}

export function ItemNoteEditor({ note, onSave }: { note: string | null; onSave: (n: string) => void }) {
  const [openDesktop, setOpenDesktop] = useState(false);
  const [openMobile, setOpenMobile] = useState(false);

  const triggerButton = (
    <button
      type="button"
      aria-label="Tambah catatan"
      className="flex h-8 items-center gap-1 rounded-full px-2 text-xs text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
    >
      <NotebookPen className="h-3.5 w-3.5" />
      {note ? 'Ubah catatan' : 'Catatan'}
    </button>
  );

  return (
    <>
      {/* Tablet/desktop: Popover, hidden on mobile-portrait */}
      <div className="hidden md:block landscape:block">
        <Popover open={openDesktop} onOpenChange={setOpenDesktop}>
          <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          <PopoverContent>
            <NoteForm note={note} onSave={onSave} onDone={() => setOpenDesktop(false)} />
          </PopoverContent>
        </Popover>
      </div>
      {/* Mobile-portrait: Sheet */}
      <div className="md:hidden landscape:hidden">
        <Sheet open={openMobile} onOpenChange={setOpenMobile}>
          <SheetTrigger asChild>{triggerButton}</SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Catatan Item</SheetTitle>
            </SheetHeader>
            <NoteForm note={note} onSave={onSave} onDone={() => setOpenMobile(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Add setNote helper and wire into cart line**

In `app/pos/page.tsx`, add a helper function near `changeQty`:

```tsx
  function setLineNote(lineId: string, note: string) {
    setCart((prev) => prev.map((l) => (l.line_id === lineId ? { ...l, notes: note || null } : l)));
  }
```

In the cart line `<li>` rendering, inside the `<div className="min-w-0 flex-1">` block (where `product_name`, `variant_summary`, and `price` are shown), add the note editor below the price line:

```tsx
                      <p className="text-xs text-[var(--muted)]">{formatRupiah(line.price)}</p>
                      {line.notes && <p className="mt-0.5 truncate text-xs italic text-[var(--muted)]">"{line.notes}"</p>}
                      <div className="mt-1">
                        <ItemNoteEditor note={line.notes} onSave={(n) => setLineNote(line.line_id, n)} />
                      </div>
```

Add the import:

```tsx
import { ItemNoteEditor } from '../../components/pos/ItemNoteEditor';
```

- [ ] **Step 3: Verify in browser at two breakpoints**

Run: `pnpm --filter tenant-app dev`. Resize browser to 1280px (desktop) — tap "Catatan" on a cart item, confirm a Popover opens. Resize to 375px (mobile-portrait) — confirm a bottom Sheet opens instead. Save a note in both, confirm it displays above the note button as `"note text"`.

- [ ] **Step 4: Run type-check**

Run: `cd ipos-cloud/apps/tenant-app && pnpm type-check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd ipos-cloud
git add apps/tenant-app/components/pos/ItemNoteEditor.tsx apps/tenant-app/app/pos/page.tsx
git commit -m "feat(pos): add per-item note editor (popover on tablet/desktop, sheet on mobile)"
```

---

### Task 7: Add cart-item entrance motion and swipe-to-delete

**Files:**
- Modify: `ipos-cloud/apps/tenant-app/app/pos/page.tsx` (cart `<ul>`/`<li>` rendering)

**Interfaces:**
- Consumes: `motion`, `AnimatePresence` from `framer-motion`.
- Produces: cart lines animate in on add, animate out on remove; each line supports drag-left-to-delete with a red reveal background.

- [ ] **Step 1: Wrap the cart list in AnimatePresence and each line in motion.li**

In `app/pos/page.tsx`, find the cart rendering block:

```tsx
              <ul className="space-y-3">
                {cart.map((line) => (
                  <li key={line.line_id} className="flex items-start justify-between gap-3">
```

Replace with:

```tsx
              <ul className="space-y-3">
                <AnimatePresence initial={false}>
                  {cart.map((line) => (
                    <motion.li
                      key={line.line_id}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      drag="x"
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={{ left: 0.5, right: 0 }}
                      onDragEnd={(_, info) => {
                        if (info.offset.x < -80) {
                          setCart((prev) => prev.filter((l) => l.line_id !== line.line_id));
                        }
                      }}
                      className="relative flex items-start justify-between gap-3 rounded-xl bg-[var(--surface)]"
                    >
```

Note: `dragConstraints={{ left: 0, right: 0 }}` combined with `dragElastic={{ left: 0.5, right: 0 }}` lets the element stretch left under drag (elastic resistance) but snaps back to `x: 0` when released unless `onDragEnd` removes it from the array first — framer-motion's exit animation then takes over since the item leaves `cart`.

Close the tags at the end of each line (replace the closing `</li>` with `</motion.li>`, and close `AnimatePresence` after the `.map()`):

```tsx
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
```

- [ ] **Step 2: Add the red delete-reveal background**

Immediately inside `motion.li`, before the existing content div, add a background layer that reveals as the row is dragged:

```tsx
                      <div className="absolute inset-0 -z-10 flex items-center justify-end rounded-xl bg-red-500 px-4">
                        <Trash2 className="h-4 w-4 text-white" />
                      </div>
```

Add `Trash2` to the existing `lucide-react` import in `app/pos/page.tsx` if not already imported there (it's already imported in `QtyStepper.tsx`, but `pos/page.tsx` itself needs its own import since this JSX lives in the page file):

```tsx
import { Trash2 } from 'lucide-react';
```

- [ ] **Step 3: Add reduced-motion fallback**

At the top of `PosPage`, add a small hook-free check using `window.matchMedia` guarded for SSR, and conditionally disable `drag`/shrink the transition:

```tsx
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

Update the `motion.li` props to branch on this:

```tsx
                      initial={prefersReducedMotion ? false : { opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -20, height: 0, marginBottom: 0 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: 'easeOut' }}
                      drag={prefersReducedMotion ? false : 'x'}
```

- [ ] **Step 4: Verify in browser**

Run: `pnpm --filter tenant-app dev`, open `/pos`, add 2-3 items. Confirm: each new item slides in from the right while fading in. Drag a cart row to the left past ~80px and release — confirm it's removed with an exit animation and the red background with trash icon was visible during the drag. Drag less than 80px and release — confirm it snaps back without deleting.

Then in Chrome DevTools, enable "Emulate CSS prefers-reduced-motion: reduce" (Rendering tab), reload, and confirm items appear instantly without slide/fade and dragging is disabled.

- [ ] **Step 5: Run type-check**

Run: `cd ipos-cloud/apps/tenant-app && pnpm type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd ipos-cloud
git add apps/tenant-app/app/pos/page.tsx
git commit -m "feat(pos): add cart entrance/exit motion and swipe-to-delete with reduced-motion fallback"
```

---

### Task 8: Add AnimatePresence transitions between POS modal steps

**Files:**
- Modify: `ipos-cloud/apps/tenant-app/app/pos/page.tsx` (the `{variantFor && <VariantModal .../>}` and `{payOpen && <PaymentModal .../>}` render block, and inside `PaymentModal`'s `pickCustomer` branch)

**Interfaces:**
- Consumes: `AnimatePresence`, `motion` from `framer-motion`.
- Produces: modal mount/unmount and internal step switches (variant picker ↔ payment ↔ customer-picker-within-payment) crossfade instead of popping instantly.

- [ ] **Step 1: Wrap the top-level modal conditionals**

Find, near the end of `PosPage`'s JSX (after the cart `<aside>` closes):

```tsx
      {variantFor && (
        <VariantModal ... />
      )}

      {payOpen && <PaymentModal ... />}
```

Wrap both in a single `AnimatePresence mode="wait"`:

```tsx
      <AnimatePresence mode="wait">
        {variantFor && (
          <motion.div key="variant" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <VariantModal
              menu={variantFor}
              groups={groupsForMenu(variantFor)}
              onClose={() => setVariantFor(null)}
              onConfirm={(deltas, summary) => {
                addLine(variantFor, deltas, summary);
                setVariantFor(null);
              }}
            />
          </motion.div>
        )}
        {payOpen && (
          <motion.div key="payment" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <PaymentModal total={subtotal} initialCustomer={customer} onClose={() => setPayOpen(false)} onConfirm={submitOrder} />
          </motion.div>
        )}
      </AnimatePresence>
```

`mode="wait"` ensures the variant modal fully exits before the payment modal enters if both were ever toggled in quick succession (they're mutually exclusive in this UI, so this mostly guards against animation overlap glitches).

- [ ] **Step 2: Animate the pickCustomer branch inside PaymentModal**

Inside `PaymentModal`, find:

```tsx
  if (pickCustomer) {
    return (
      <CustomerPicker
        onClose={() => setPickCustomer(false)}
        onPick={(c) => {
          setCustomer(c);
          setPickCustomer(false);
        }}
      />
    );
  }
```

Wrap the conditional return in a crossfade by restructuring `PaymentModal`'s return to always render through `AnimatePresence`:

```tsx
  return (
    <AnimatePresence mode="wait">
      {pickCustomer ? (
        <motion.div key="picker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <CustomerPicker
            onClose={() => setPickCustomer(false)}
            onPick={(c) => {
              setCustomer(c);
              setPickCustomer(false);
            }}
          />
        </motion.div>
      ) : (
        <motion.div key="payment-form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <Modal title="Bayar" onClose={onClose}>
            {/* ...existing Modal children unchanged... */}
          </Modal>
        </motion.div>
      )}
    </AnimatePresence>
  );
```

(This requires moving the existing `<Modal title="Bayar" ...>...</Modal>` JSX — currently the direct return value of `PaymentModal` — one level deeper into the `else` branch, unchanged otherwise.)

- [ ] **Step 3: Verify in browser**

Run: `pnpm --filter tenant-app dev`, open `/pos`, tap a menu item with variants — confirm the variant picker crossfades in rather than popping. Confirm it. Add to cart, tap Bayar — confirm payment modal crossfades in. Inside payment, tap "Pilih"/"Ganti" for customer — confirm the customer picker crossfades in place of the payment form, and back again.

- [ ] **Step 4: Run type-check**

Run: `cd ipos-cloud/apps/tenant-app && pnpm type-check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd ipos-cloud
git add apps/tenant-app/app/pos/page.tsx
git commit -m "feat(pos): crossfade transitions between variant/payment/customer-picker steps"
```

---

### Task 9: Full production build verification

**Files:** none (verification only)

- [ ] **Step 1: Run production build**

Run: `cd ipos-cloud/apps/tenant-app && pnpm build`
Expected: build completes with no type errors, `/pos` route listed in the output route table.

- [ ] **Step 2: Manual smoke test on tablet-width viewport**

Run: `pnpm start` (after build), open `http://localhost:3100/pos` in a browser resized to 834×1112 (iPad Pro 11 portrait) and 1112×834 (landscape). Confirm split-panel layout still works, all Task 1-8 features are usable, touch targets look ≥44px.

- [ ] **Step 3: Commit (if any fixes were needed)**

```bash
cd ipos-cloud
git add -A
git commit -m "fix(pos): address build/verification issues from Kasir redesign"
```

(Skip this commit if no changes were needed.)
