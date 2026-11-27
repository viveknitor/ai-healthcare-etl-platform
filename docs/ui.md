# Minimal UI Textual Data & Calm File Ingestion UX Plan

## Goal Description

The current SmartHealth ETL React UI is visually clean in structure (`DESIGN.md` — Clinical Daylight), but **textually dense** and **vertically crowded**—especially during **File Ingestion (`UploadPage`)**, where an always-expanded 6-agent visualizer (`AgentWorkflowVisualizer` + `LIVE AGENT RUN FEED`) sits above the wizard stepper and pushes the primary upload workspace down the screen.

This plan streamlines both the **visual hierarchy** and **visible UI copy** across the application so every screen feels **calm, scannable, and effortless**:
- **Cleanest File Ingestion Flow**: Replace the heavy top agent-feed block on `UploadPage` with a sleek horizontal numbered stepper at the top, a Phase header with a top-right `Next Step →` action, and a balanced **two-column Step 1 workspace** (`Source Data` upload on the left + `"What We'll Do"` pipeline preview on the right), with agent activity tucked into a compact collapsible status pill.
- **Minimal Copy (~55–65% fewer words)**: Preserve 100% of functionality, clinical accuracy, and WCAG AA accessibility (`aria-label`s remain descriptive for screen readers even when visible labels are concise).

### Guiding Principles
1. **Workspace first, telemetry on demand**: Keep the primary user task (uploading, reviewing mappings, validating, delivering) at the top of the viewport; collapse verbose agent feeds behind a compact status toggle.
2. **Show, don't lecture**: Remove redundant subtitles and multi-sentence helper paragraphs where the UI controls already make the action obvious.
3. **Short, action-first labels**: Keep buttons to 1–3 words (`Ingest File`, `Validate`, `Deliver`, `Approve`, `Next Step →`) and table/card titles to 1–3 words.
4. **Progressive disclosure**: Collapse secondary details (agent step logs, diagnostic remediation lists, row previews, and contract rationales) behind clean toggles or concise 1-line summaries.
5. **Zero loss of clarity**: Keep numeric counts, error diagnostics, and 1-click fixes immediately legible using `tabular-nums` and semantic status badges.

---

## User Review Required

> [!IMPORTANT]
> **Baseline Test Suite Finding**: Running `npm test` in `ui/` currently reports **11 passed, 1 failed** in `redesign.test.jsx`. `SidebarNav.jsx` was previously updated to `"New Ingestion"` and the theme-switcher buttons were removed, while `redesign.test.jsx` (`SidebarNav triggers tab navigation and exposes only the Daylight theme option`) still asserts `/Direct Ingestion Hub/i` and `/Daylight/i`. This plan includes updating `redesign.test.jsx` to match the minimal UI copy.

> [!IMPORTANT]
> **Accessibility Preservation**: Shortening visible button and header labels will **not** weaken screen-reader context. Icon-only or terse buttons (`Open`, `Validate`, `CSV`, `JSON`) will retain clear `aria-label` attributes where needed.

---

## Open Questions

> [!IMPORTANT]
> **Resolved — File Ingestion Layout**: `UploadPage` will move `AgentWorkflowVisualizer` into a compact collapsible status bar (defaulting to collapsed) so the numbered `StepperHeader` and two-column `Phase 1: Upload` workspace sit cleanly at the top.
>
> Please confirm your preference on these two remaining UX details before execution:
> 1. **Dashboard Card Descriptions (`OverviewDashboardPage`)**: On the 3 Workflow cards and 4 Infrastructure cards, should we **remove all body paragraphs** (leaving icon + short title + badge/endpoint), or keep a single 4–6 word phrase on the 3 Workflow cards?
> 2. **Diagnostic Steps (`EditRecordModal`)**: When a quarantined row has an error, should we show **only the 1-line error summary + 1-click Fix button** by default (with `"Steps"` expandable), or keep the 2-bullet remediation list always visible?

---

## Proposed Changes

### 1. Application Shell & Navigation

#### [MODIFY] [SidebarNav.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/layout/SidebarNav.jsx)
#### [MODIFY] [TopHeader.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/layout/TopHeader.jsx)
#### [MODIFY] [useAppStore.js](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/stores/useAppStore.js)

- **Sidebar brand subtitle**: `"FHIR R4 ETL Platform"` → `"FHIR R4"`
- **Sidebar footer status**:
  - `"All Systems Online"` → `"Online"`
  - `"API Online · Medplum Off"` → `"Medplum Off"`
  - `"Backend Offline"` → `"Offline"`
  - Remove secondary `"Local Workspace"` sublabel.
- **Header titles (`TAB_META`)**:
  - `upload.headerTitle`: `"New Ingestion Wizard"` → `"New Ingestion"`
  - `pipeline.headerTitle`: `"FHIR Live Sync"` → `"Live Sync"`
  - `mapping.headerTitle`: `"AI Mapping Studio"` → `"Mapping Studio"`

```diff
// SidebarNav.jsx
- <span className="block truncate text-[10px] font-medium tracking-wide text-[var(--sidebar-muted)]">
-   FHIR R4 ETL Platform
- </span>
+ <span className="block truncate text-[10px] font-medium tracking-wide text-[var(--sidebar-muted)]">
+   FHIR R4
+ </span>
```

---

### 2. Overview Dashboard

#### [MODIFY] [OverviewDashboardPage.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/pages/OverviewDashboardPage.jsx)
#### [MODIFY] [MetricCard.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/layout/MetricCard.jsx)

Significantly de-clutter the hero banner, KPI sub-labels, workflow cards, and infrastructure cards:

| Section | Current Copy | Minimal Copy |
|---|---|---|
| Hero Badge | `HL7 FHIR R4 Enterprise Interoperability System` | `FHIR R4` |
| Hero Title | `Clinical Data Ingestion & Reconciliation` | `Clinical Data Hub` |
| Hero Subtitle | `Autonomous multi-agent ETL pipeline reconciling PlanData, Excel, CSV, and HAPI FHIR feeds into Medplum with human-governed mapping contracts and zero data loss.` | `Reconcile files and FHIR feeds into Medplum.` |
| Hero CTAs | `Ingest New Data File` / `Run HAPI Sync` | `Ingest File` / `HAPI Sync` |
| KPI 1 | `Clinical Quality Rate` · `Certified`/`Monitored` · `X valid / Y quarantined` | `Quality Rate` · `Pass`/`Review` · `X valid · Y invalid` |
| KPI 2 | `Records Processed` · `X runs • Y persisted` | `Processed` · `X runs · Y saved` |
| KPI 3 | `AI Auto-Healed Rules` · `Gemini Flash` · `Closed-loop schema repair` | `Auto-Healed` · `AI` · `Schema repair` |
| KPI 4 | `Peak Delivery Velocity` · `SSE Stream` · `Last batch: X rec/s` | `Peak Speed` · `SSE` · `Last: X rec/s` |
| Chart Card | `Recent Pipeline Batch Throughput & Validation` + subtitle | `Batch Throughput` (no subtitle) |
| Ledger Card | `Recent Run Ledger` + `Latest batches recorded on disk` | `Recent Runs` (no subtitle) |
| Workflows Header | `Operational Workflows` + 12-word subtitle | `Workflows` (no subtitle) |
| Workflow Cards (×3) | Long titles (`Direct File Ingestion (QNEXT / PlanData)`), 2-line descriptions, verbose CTAs (`Launch Ingestion Wizard`) | `File Ingestion` / `HAPI ↔ Medplum` / `Mapping Studio`, 1 short phrase, CTA `Open` |
| Infra Header | `Connected Healthcare Infrastructure` + 13-word subtitle | `Infrastructure` (no subtitle) |
| Infra Cards (×4) | Service name + badge + 10-word description paragraph + meta footer | Service name + badge + endpoint/latency line (descriptions removed) |

```diff
// OverviewDashboardPage.jsx — Infrastructure cards (remove boilerplate desc paragraph)
- <p className="m-0 text-xs text-[var(--text-muted)] leading-relaxed">{svc.desc}</p>
```

---

### 3. Multi-Agent Visualizer & Dossier (Compact & Collapsible)

#### [MODIFY] [AgentWorkflowVisualizer.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/AgentWorkflowVisualizer.jsx)
#### [MODIFY] [AgentLiveFeed.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/AgentLiveFeed.jsx)
#### [MODIFY] [agentRegistry.js](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/agentRegistry.js)
#### [MODIFY] [AgentDossierDialog.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/modals/AgentDossierDialog.jsx)

Make the agent pipeline strip unobtrusive so it never crowds out the ingestion wizard:

- **Default Compact Bar**: Render a single-row status strip (`"Agent Pipeline"` · active stage badge · LLM cost/token pill · `"Details"` expand/collapse button). Default to **collapsed** on `UploadPage` so `StepperHeader` is the first primary element; clicking `"Details"` reveals the 6-agent flow and live feed.
- **Header (when expanded)**: `"Agent Pipeline"`, remove the subtitle `"6 specialized relay agents + closed-loop Self-Healer with strict human gate at Agent 3."` (keep only `"Demo"` badge when `IS_DEMO` is true).
- **Tabs**: `"Relay View"` → `"Flow"`, `"Agent Roster"` → `"Roster"`.
- **Status Badges**:
  - `"Ingestion Complete"` → `"Complete"`
  - `"Batch Validated"` → `"Validated"`
  - `"Approved by Steward"` → `"Approved"`
  - `"Discovery Mode"` → `"Draft"`
  - `"LLM Cost: $0.00018 (420 tok)"` → `"$0.00018 · 420 tok"`
- **6 Relay Tiles**: Show `A1` + status pill (`Done` / `Active` / `Wait`) + short label (`Extraction`, `AI Mapping`, `Approval`, `Validation`, `Delivery`, `Audit`) instead of stacking both codename (`DataScout Agent`) and archetype (`Extraction & Discovery`).
- **`AgentLiveFeed.jsx`**: Tighten `"Human Governance Gate — review the mapping contract rules below before proceeding."` → `"Approve mapping to continue."`
- **`AgentDossierDialog.jsx` & `agentRegistry.js`**: Shorten section headings (`"Mission"`, `"Input"`, `"Output"`, `"Behavior"`) and trim each agent's `mission` and `action` strings to a single concise sentence.

---

### 4. Clean File Ingestion Process & Four-Step Wizard (`UploadPage`)

#### [MODIFY] [UploadPage.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/pages/UploadPage.jsx)
#### [MODIFY] [StepperHeader.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/wizard/StepperHeader.jsx)
#### [MODIFY] [DropZone.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/ui/DropZone.jsx)
#### [MODIFY] [Step1SourceIntake.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/wizard/Step1SourceIntake.jsx)
#### [MODIFY] [Step2MappingContract.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/wizard/Step2MappingContract.jsx)
#### [MODIFY] [MappingContractViewer.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/MappingContractViewer.jsx)
#### [MODIFY] [Step3QualityGate.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/wizard/Step3QualityGate.jsx)
#### [MODIFY] [Step4ReconciliationHub.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/wizard/Step4ReconciliationHub.jsx)

```
flowchart LR
  S1["1. Upload"] --> S2["2. Mapping"] --> S3["3. Validate"] --> S4["4. Deliver"]
```

#### A. Page Hierarchy & Top Stepper (`UploadPage.jsx` & `StepperHeader.jsx`)
- **Top-first Stepper**: Place `StepperHeader` directly at the top of `UploadPage` (moving the collapsed `AgentWorkflowVisualizer` status bar below the wizard or as a slim footer/header pill) so users immediately see where they are in the 4-step process.
- **Clean Numbered Stepper (`StepperHeader.jsx`)**:
  - Use the minimal horizontal numbered circle stepper with hairline connectors (`1. Upload` — `2. Mapping` — `3. Validate` — `4. Deliver`), active dark-navy circle (`#161b33`), and green checkmark for completed steps.
- **Consistent Phase Header Bar (Steps 1–4)**:
  - Left: `Phase {n}: {Title}` + 1-line subtitle (≤ 10 words).
  - Right: Primary progression button (`Next Step →`, disabled until the step's prerequisite is satisfied) alongside any contextual secondary action.

#### B. Step 1: Two-Column Source Intake & Process Preview (`Step1SourceIntake.jsx` & `DropZone.jsx`)
Adopt a calm, balanced **two-column grid (`grid-cols-1 lg:grid-cols-12 gap-5`)** for Phase 1:

- **Phase Header**:
  - Title: `"Phase 1: Upload & Describe"`
  - Subtitle: `"Provide your clinical dataset and target FHIR R4 resource."`
  - Top-right CTA: `"Next Step →"` (enabled once `fileData` is loaded).
- **Left Column (`lg:col-span-7`) — Source Data Card**:
  - Eyebrow: `"SOURCE DATA"`
  - Card Title: `"Upload Clinical File"`
  - Segmented Source Toggle: `"File Upload"` (default) | `"Sample Dataset"` (1-click loads PlanData sample without cluttering the header).
  - **`DropZone.jsx`**: Clean prompt `"Drop file here or browse"` with format chips (`CSV`, `XLSX`, `TSV`, `JSON`); remove the multi-sentence SQL/PlanData paragraph.
  - **Loaded Dataset Bar (appears inline once uploaded)**: Compact `"Tag"` input, `"Resource"` selector (`Patient`, `Observation`, `Condition`, `Encounter`), record/column count badges, and collapsible `"Preview (3 rows)"` toggle (collapsed by default or compact 3-row table).
- **Right Column (`lg:col-span-5`) — `"WHAT WE'LL DO"` Process Guide Card**:
  - Eyebrow: `"WHAT WE'LL DO"`
  - Card Title: `"Autonomous FHIR Pipeline"`
  - Concise 1-line intro: `"Upload a file to start. Specialized agents handle:"`
  - Clean 4-item vertical step list with subtle agent badges:
    1. **`DataScout`** — `"Parse columns and sample clinical rows"` (`Ready` / `Done`)
    2. **`AI Architect`** — `"Synthesize HL7 FHIR R4 mapping rules"` (`Next`)
    3. **`Compliance & Sentinel`** — `"Human approval and dry-run schema check"` (`Gate`)
    4. **`Dispatcher & Auditor`** — `"Stream to Medplum and reconcile audit log"` (`Final`)
  - *UX benefit*: Gives first-time and repeat users full clarity on the end-to-end ingestion process right beside the dropzone, without needing the giant 6-box visualizer or live log feed at the top.

#### C. Steps 2–4: Streamlined Phase Screens
- **`Step2MappingContract.jsx` & `MappingContractViewer.jsx`**:
  - Phase Header: `"Phase 2: Mapping Contract"`, subtitle `"Review and approve FHIR R4 rules."`, top-right `"Next Step →"` (or `"Approve & Continue →"`).
  - Buttons: `"Re-Synthesize"`, `"Approve"`, `"Save"`.
  - Viewer tabs: `"Rules"`, `"Flow"`, `"JSON"`.
  - Coverage bar: `"Coverage: {mapped}/{total} ({pct}%)"`, button `"Map Remaining ({n})"`, unmapped label `"Unmapped:"`.
  - Keep accessible labels on custom rule inputs (`Source Column`, `Target FHIR Path`, `Add Rule`, `Add Custom Rule`) so tests and screen readers remain accurate.
- **`Step3QualityGate.jsx`**:
  - Phase Header: `"Phase 3: Quality Gate"`, subtitle `"Dry-run FHIR R4 schema check."`, top-right `"Validate ({count})"` + `"Next Step →"`.
  - Action buttons: `"Deliver ({validCount})"` (or `"Deliver {validCount} Valid"` when quarantined rows exist), `"View Quarantined ({invalidCount})"`, `"Auto-Heal"`.
  - Status banner: `"All {totalCount} records valid"` / `"Ready to validate"` (1 concise line).
  - Self-heal stages: `"1. Errors"`, `"2. Diagnose"`, `"3. Patch"`, `"4. Re-Check"`.
- **`Step4ReconciliationHub.jsx`**:
  - Phase Header: `"Phase 4: Deliver & Audit"` (no subtitle).
  - Export buttons: `"CSV ({n})"`, `"Quarantine ({n})"`, `"Manifest ({n})"`, `"JSON"`.
  - Table headers: `#`, `Source`, `Record`, `Target`, `Status`, `Actions`.

---

### 5. Live Sync, Mapping Studio & Shared Tables

#### [MODIFY] [PipelinePage.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/pages/PipelinePage.jsx)
#### [MODIFY] [MappingPage.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/pages/MappingPage.jsx)
#### [MODIFY] [ReconciliationTable.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/ReconciliationTable.jsx)
#### [MODIFY] [DataTableShell.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/ui/DataTableShell.jsx)

- **`PipelinePage.jsx`**:
  - Top MetricCards: `"Batch"` (`{totalCount}` · `HAPI FHIR`), `"Delivered"` (`{deliveredCount}` · `Medplum`), `"Target"` (`Medplum :8103`), `"Standard"` (`FHIR R4`).
  - Control card: `"HAPI → Medplum Sync"` (remove 2-line subtitle). Resource sublabels: `"Demographics"`, `"Labs & Vitals"`, `"Diagnoses"`, `"Visits"`.
  - Inputs: `"Count"`, `"Offset"`.
  - Actions: `"Prev"`, `"Validate ({count})"`, `"Deliver ({count})"`, `"Next"`. Replace `"Quality Gate Policy: Run Validate & Verify Schema first..."` with `"Validate before delivering."`
  - Table headers: `#`, `Source`, `Clinical`, `Identity`, `Target`, `Status`, `Inspect`.
  - Export buttons: `"CSV"`, `"JSON"`.
- **`MappingPage.jsx`**:
  - Remove page-level banner description (`"Synthesize HL7 FHIR R4 mapping contracts..."`), keep compact title + model badge.
  - Card headers: `"1. Sample JSON"`, `"2. Contract & Approval"`, `"3. Transform Output"`. Remove redundant card descriptions.
  - Buttons: `"Suggest"`, `"Approve"`, `"Test"`, tabs `"Table"` / `"FHIR JSON"`.
- **`ReconciliationTable.jsx` & `DataTableShell.jsx`**:
  - `ReconciliationTable` headers: `Field`, `{sourceTitle}`, `Rule`, `{targetTitle}`, `Status`.
  - `DataTableShell`: `"{startRow}–{endRow} of {totalFiltered}"` (drop `"Showing "`), `"Prev"` / `"Next"` pagination buttons.

---

### 6. Modals & Diagnostics

#### [MODIFY] [DeliveryConfirmationModal.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/modals/DeliveryConfirmationModal.jsx)
#### [MODIFY] [InspectRecordModal.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/modals/InspectRecordModal.jsx)
#### [MODIFY] [EditRecordModal.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/modals/EditRecordModal.jsx)
#### [MODIFY] [AddRecordModal.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/components/modals/AddRecordModal.jsx)
#### [MODIFY] [errorDiagnostics.js](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/utils/errorDiagnostics.js)

- **`DeliveryConfirmationModal.jsx`**: Title `"Confirm Delivery"`, subtitle `"{targetResource} · {datasetName}"`, concise 1-line summary.
- **`InspectRecordModal.jsx`**: Title `"Record: {source_id}"`, subtitle `"{targetResource}"`, tabs `"Diff"`, `"Database"`, `"JSON"`. In Database tab, concise `"Verify in Medplum"` button + 1-line description.
- **`EditRecordModal.jsx`**: Title `"Edit: {sourceId}"`, subtitle `"Fix fields and re-validate"`, button `"Save & Validate"`. Keep `"Apply Fix: {suggestedFix}"` button text so `redesign.test.jsx` continues passing cleanly. Make diagnostic explanation concise.
- **`AddRecordModal.jsx`**: Title `"Add Record"`, remove verbose subtitle, button `"Add & Validate"`.

---

### 7. Test Suite Alignment

#### [MODIFY] [redesign.test.jsx](file:///e:/ai-healthcare-etl-platform/ai-healthcare-etl-platform/ui/src/test/redesign.test.jsx)

- Update the `SidebarNav` test to verify current minimal navigation labels (`"Dashboard"`, `"New Ingestion"`, `"Live Sync"`, `"Mapping Studio"`) and `"Online"` / `"Connecting…"` status indicator instead of the removed `"Direct Ingestion Hub"` and theme-toggle buttons.
- Add assertions verifying concise labels/empty states across `DropZone`, `MappingContractViewer`, `EditRecordModal`, and `EmptyState`.

---

## Verification Plan

### Automated Tests
1. Run the UI Vitest suite after all component and test updates:
   ```powershell
   Push-Location ui; npm test; Pop-Location
   ```
   Expected: All tests in `src/test/redesign.test.jsx` pass with 0 failures.
2. Run the production Vite bundle build to confirm zero JSX syntax errors, missing imports, or broken references:
   ```powershell
   Push-Location ui; npm run build; Pop-Location
   ```
   Expected: Clean Vite production build exit code 0.

### Manual Verification
1. Start the UI dev server (`npm run dev` in `ui/`) and inspect all 4 tabs (`Dashboard`, `New Ingestion`, `Live Sync`, `Mapping Studio`) at desktop (`1280px+`) and narrow (`768px`) viewports.
2. Walk through the 4-step upload flow using **Sample Dataset** / **File Upload**:
   - Confirm `StepperHeader` sits at the top, `Agent Pipeline` defaults to collapsed (`Details` toggle works), Step 1 renders the 2-column `Source Data` + `What We'll Do` layout with top-right `Next Step →`, and Steps 2–4 feel calm, uncrowded, and unambiguous.
3. Verify keyboard focus visibility, contrast, and screen-reader `aria-label`s on condensed buttons.
