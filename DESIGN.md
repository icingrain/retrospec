# Retrospec Design System

## 1. Atmosphere & Identity

Retrospec feels like a quiet migration command center: technical, durable, and readable under long-running work. The signature is ledger calm, where status-heavy surfaces use restrained typography, precise spacing, and clear state labels instead of decorative chrome.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
| --- | --- | --- | --- | --- |
| Surface/primary | `--surface-primary` | `#F7F4ED` | `#11100E` | Page background |
| Surface/secondary | `--surface-secondary` | `#FFFDF8` | `#1A1815` | Cards and panels |
| Surface/elevated | `--surface-elevated` | `#FFFFFF` | `#24211D` | Raised status blocks |
| Text/primary | `--text-primary` | `#1E1B16` | `#F7F4ED` | Headings and primary body |
| Text/secondary | `--text-secondary` | `#665F52` | `#C8BFAF` | Supporting copy |
| Text/tertiary | `--text-tertiary` | `#928879` | `#8F8576` | Labels and timestamps |
| Border/default | `--border-default` | `#DED6C8` | `#39342D` | Cards, dividers, inputs |
| Border/subtle | `--border-subtle` | `#EDE5D8` | `#2C2822` | Soft separations |
| Accent/primary | `--accent-primary` | `#3B5B42` | `#9FC7A6` | Links, focus, primary status |
| Accent/hover | `--accent-hover` | `#2D4533` | `#B8D9BE` | Hover states |
| Status/success | `--status-success` | `#23704A` | `#84D0A4` | Completed, ready |
| Status/warning | `--status-warning` | `#A66B14` | `#E6B86E` | Stale, pending |
| Status/error | `--status-error` | `#A94438` | `#E9958A` | Failed, blocked |
| Status/info | `--status-info` | `#35618D` | `#9FC3E8` | Running, daemon info |

### Rules

- Accent is operational, not decorative: use it only for links, focus, and primary status emphasis.
- State colors must always be paired with text labels.
- New colors must be added here before use.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- |
| Display | `48px / 3rem` | 700 | 1.1 | `-0.02em` | Product title |
| H1 | `36px / 2.25rem` | 700 | 1.2 | `-0.015em` | Page header |
| H2 | `28px / 1.75rem` | 650 | 1.3 | `-0.01em` | Section header |
| H3 | `22px / 1.375rem` | 650 | 1.4 | 0 | Card title |
| Body/lg | `18px / 1.125rem` | 400 | 1.6 | 0 | Intro copy |
| Body | `16px / 1rem` | 400 | 1.6 | 0 | Default text |
| Body/sm | `14px / 0.875rem` | 400 | 1.5 | 0 | Secondary info |
| Caption | `12px / 0.75rem` | 600 | 1.4 | `0.02em` | Labels and metadata |
| Overline | `11px / 0.6875rem` | 700 | 1.3 | `0.08em` | Uppercase section labels |

### Font Stack

- Primary: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Mono: `"SFMono-Regular", Consolas, "Liberation Mono", monospace`
- Serif: not used.

### Rules

- Body text never drops below 14px.
- Paths, IDs, and timestamps use the mono stack.
- Headings stay compact and utilitarian; avoid marketing-style flourish.

## 4. Spacing & Layout

### Base Unit

All spacing derives from a base of **4px**.

| Token | Value | Usage |
| --- | --- | --- |
| `--space-1` | `4px` | Tight inline gaps |
| `--space-2` | `8px` | Compact label groups |
| `--space-3` | `12px` | Status chips, small card gaps |
| `--space-4` | `16px` | Default card padding |
| `--space-5` | `20px` | Comfortable inner spacing |
| `--space-6` | `24px` | Panel padding |
| `--space-8` | `32px` | Section grouping |
| `--space-10` | `40px` | Major layout separation |
| `--space-12` | `48px` | Page header separation |
| `--space-16` | `64px` | Maximum page rhythm |

### Grid

- Max content width: `1120px`
- Column system: responsive single-column shell, two-column cards from `768px`
- Breakpoints: `sm 640px`, `md 768px`, `lg 1024px`, `xl 1280px`, `2xl 1536px`

### Rules

- Long project paths wrap safely and use mono typography.
- Dashboard sections favor scannability over density until real data volume requires tables.

## 5. Components

### Status Card

- **Structure**: overline label, H3 title, short body copy, optional metadata row.
- **Variants**: neutral, success, warning, error, info.
- **Spacing**: `--space-4` compact, `--space-6` default.
- **States**: default and focus-within for cards containing links or controls.
- **Accessibility**: status text is visible; color is secondary.
- **Motion**: hover transitions use opacity or transform only when interactive.

## 6. Motion & Interaction

### Timing

| Type | Duration | Easing | Usage |
| --- | --- | --- | --- |
| Micro | `120ms` | `ease-out` | Link hover, chip hover |
| Standard | `220ms` | `ease-in-out` | Panel reveal in later phases |
| Emphasis | `420ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Page entry in later phases |

### Rules

- Animate only `transform`, `opacity`, or `filter`.
- Respect `prefers-reduced-motion`.
- Every interactive element needs visible focus treatment.

## 7. Depth & Surface

### Strategy

Depth uses **borders-only**. No box shadows in dashboard shell surfaces.

| Type | Value | Usage |
| --- | --- | --- |
| Default | `1px solid var(--border-default)` | Cards, primary dividers |
| Subtle | `1px solid var(--border-subtle)` | Soft separators |
