# SmartHealth ETL — Clinical Daylight Design System (`DESIGN.md`)

## 1. Visual Identity & Product Domain
- **Product**: AI Healthcare ETL & HL7 FHIR R4 Interoperability Control Plane
- **Primary Mode**: **Clinical Daylight (Light)** only.
- **Core Ethos**: *AI proposes, human steward governs, deterministic engine executes.* High-legibility clinical precision over decorative glassmorphism.

## 2. Color Roles (`tokens.css`)
- **Canvas (`--bg-canvas`)**: `#f6f8fb`
- **Primary Surface (`--bg-surface`)**: `#ffffff`
- **Elevated / Subtle Surface (`--bg-subtle`)**: `#f1f5f9`
- **Hairline Borders (`--border-default`, `--border-strong`)**: `#dce3ee` / `#c3cfdf`
- **Ink (`--text-primary`, `--text-secondary`, `--text-muted`)**: `#0f172a`, `#334155`, `#475569` (>= 4.5:1 AA contrast)
- **Semantic Roles** (always paired with icon + label, never color alone):
  - **Clinical Primary (`--brand`)**: `#1d4ed8`
  - **Verified / Delivered (`--ok`)**: `#047857`
  - **Governance Review / Warning (`--warn`)**: `#b45309`
  - **Quarantined / Error (`--bad`)**: `#b91c1c`
  - **AI Reasoning (`--ai`)**: `#6d28d9` — strictly scoped to Gemini synthesis & self-healing indicators.

## 3. Typography
- **UI Sans**: `Inter Variable` (self-hosted via `@fontsource-variable/inter`)
- **Technical Mono**: `JetBrains Mono Variable` (self-hosted via `@fontsource-variable/jetbrains-mono`)
- **Scale & Floor**: `12px` (`0.75rem`) strict minimum; `13px` dense tables/controls; `14px` prose; `18px–24px` headings (`text-wrap: balance`).
- **Tabular Figures**: `font-variant-numeric: tabular-nums` enforced on all KPIs, row counts, confidence scores, latencies, and tables.

## 4. Interaction, Overlays & Motion
- **Primitives**: `@base-ui/react` (`Dialog`, `AlertDialog`, `Tabs`, `Select`, `Tooltip`), `lucide-react` icons, `sonner` queued toasts.
- **No Blocking Native Popups**: Zero `window.alert()`, `window.confirm()`, or `window.prompt()`.
- **Motion Budget**: Compositor properties (`transform`, `opacity`) only, `150ms–220ms`, `cubic-bezier(0.23, 1, 0.32, 1)`, gated by `<MotionConfig reducedMotion="user">` and `@media (prefers-reduced-motion: reduce)`.
