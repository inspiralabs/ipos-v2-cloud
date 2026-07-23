# Design

## Visual Theme

Mood: a small studio's control desk — warm task-lamp glow on a clean surface, built for quick glances and fast decisions, not long reading. Distinct identity from the client-facing Inspira POS brand (maroon/gold): this is the internal tool the team sees, never the client.

Color strategy: **Restrained** — near-neutral surfaces, one warm primary carrying action/identity, semantic colors doing the heavy lifting for status (the single most-scanned thing on every screen).

## Color (OKLCH)

### Light mode
```css
--bg: oklch(1.000 0.000 0);        /* pure white */
--surface: oklch(0.970 0.010 40);  /* card/panel bg, faint warm lift off bg */
--surface-2: oklch(0.945 0.014 40);/* nested surface (table header, input bg) */
--border: oklch(0.890 0.014 40);
--ink: oklch(0.220 0.020 40);      /* body text, ~15:1 vs bg */
--muted: oklch(0.520 0.020 40);    /* secondary text, ~4.8:1 vs bg */
--primary: oklch(0.660 0.201 40);  /* burnt coral/amber — CTAs, active nav, links */
--primary-ink: oklch(1.000 0.000 0); /* text on primary fill */
--accent: oklch(0.550 0.130 210);  /* deep teal — secondary emphasis, info */
--accent-ink: oklch(1.000 0.000 0);
```

### Dark mode
```css
--bg: oklch(0.090 0.000 0);
--surface: oklch(0.155 0.016 40);
--surface-2: oklch(0.200 0.018 40);
--border: oklch(0.280 0.018 40);
--ink: oklch(0.960 0.010 40);
--muted: oklch(0.660 0.018 40);
--primary: oklch(0.700 0.190 40);
--primary-ink: oklch(0.100 0.010 40);
--accent: oklch(0.660 0.120 210);
--accent-ink: oklch(0.100 0.010 210);
```

### Semantic status (same both modes — tuned for white-text-safe fills per contrast rules)
```css
--status-trial: oklch(0.720 0.165 75);    /* amber */
--status-active: oklch(0.580 0.145 150);  /* green */
--status-expired: oklch(0.560 0.205 25);  /* red */
--status-inactive: oklch(0.550 0.010 40); /* neutral — rendered as outline, not fill (de-emphasized on purpose) */
```
Filled status pills (trial/active/expired) always use white text — mid-luminance saturated fills read muddy with dark text (Helmholtz-Kohlrausch effect). Inactive/revoked is the one state rendered as an outline pill, not a fill — visually quieter on purpose, it's the "nothing to do here" state.

## Typography

Pairing on a contrast axis: **Sora** (geometric, distinctive, headings/labels/nav) + **Figtree** (humanist, warm, body text and data-dense tables). Neither is on the overused list (Inter/Roboto/Geist/Space Grotesk/Plus Jakarta Sans) — deliberately not Geist (was the bare Next.js default) and deliberately not Plus Jakarta Sans (that's the client-facing app's font; reusing it would blur the "own identity" goal).

- Display/section headings: Sora, 600–700
- Nav labels, stat labels, table headers: Sora, 600, uppercase tracking-wide only for the tiniest labels (stat card eyebrows) — not layered on every heading
- Body, table cells, form labels: Figtree, 400–500
- Numbers (client counts, dates, IDs): tabular-nums

Scale: 12 / 13 / 14 / 16 / 20 / 28 / 36 (text-xs through text-4xl equivalents). Body base 14px in dense tables, 16px in forms/modals.

## Layout

- App shell: fixed left sidebar (desktop ≥1024px) collapsing to a bottom-safe slide-over + top bar on mobile — not a hamburger-only pattern, primary nav (Licenses/Tenants/Leads) stays reachable in ≤2 taps on phone.
- Content max-width 1400px, page padding scales 16px (mobile) → 32px (desktop).
- Stat cards: `grid-cols-2` on mobile, `grid-cols-4` ≥768px — not a single scrolling row.
- Tables become stacked cards below 768px (no horizontal-scroll tables on phone) — each row's key/value pairs stack vertically inside a bordered card, status pill stays top-right for the "glance" principle.
- Spacing rhythm: 4/8/12/16/24/32/48, consistent across cards/sections/page padding.

## Components

- **Button**: solid primary (fill `--primary`, `--primary-ink` text) for the one primary action per view; outline/ghost for secondary; destructive actions use `--status-expired` fill + confirmation step, never a bare click.
- **Status pill**: filled rounded-full, 11px semibold uppercase, white text, one of the 4 semantic colors above. Inactive/revoked = outline variant (border + `--muted` text), not filled.
- **Card**: `--surface` bg, 1px `--border`, rounded-2xl (16px), no nested cards.
- **Table**: header row `--surface-2` bg, `--muted` text, sticky on scroll for long lists; row hover `--surface-2`; on mobile, becomes the stacked-card layout described above (same component, responsive variant, not a second implementation).
- **Modal**: centered on desktop, bottom sheet on mobile (slide up, drag-to-dismiss handle) — matches how the client app already treats sheets, keeps muscle memory across the two codebases even though the color system doesn't.
- **Empty/loading state**: skeleton rows for tables (not spinners) on load; a real illustration-free empty state with one sentence + the primary action when a list is genuinely empty (no clients yet, no leads yet).

## Motion

150–250ms, ease-out-quart. Modal/sheet: slide+fade from trigger. List filtering: no animation on the list itself (would feel laggy on a table admins re-scan often) — only the empty/loaded state crossfades. Respect `prefers-reduced-motion`.
