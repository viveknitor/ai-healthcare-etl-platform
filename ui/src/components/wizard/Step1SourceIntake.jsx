import React, { useState } from "react";
import {
  FileSpreadsheet,
  ChevronUp,
  ChevronDown,
  ArrowRight,
  Zap,
  UploadCloud,
  Sparkles,
  ShieldCheck,
  Send,
  Database,
} from "lucide-react";
import DropZone from "@/components/ui/DropZone.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import SegmentedTabs from "@/components/ui/Tabs.jsx";
import { Card, CardContent } from "@/components/ui/Card.jsx";

const RESOURCE_TARGETS = ["Patient", "Observation", "Condition", "Encounter"];
const AUDIT_COL_RE = /^(createdate|createid|lastupdate|updateid|externalediting|rowguid|timestamp)$/i;

const PIPELINE_STAGES = [
  {
    num: 1,
    name: "DataScout",
    desc: "Parse columns and sample clinical rows",
    icon: Database,
    doneWhenLoaded: true,
    idleTag: "Ready",
  },
  {
    num: 2,
    name: "AI Architect",
    desc: "Synthesize HL7 FHIR R4 mapping rules",
    icon: Sparkles,
    doneWhenLoaded: false,
    idleTag: "Next",
  },
  {
    num: 3,
    name: "Compliance & Sentinel",
    desc: "Human approval and dry-run schema check",
    icon: ShieldCheck,
    doneWhenLoaded: false,
    idleTag: "Gate",
  },
  {
    num: 4,
    name: "Dispatcher & Auditor",
    desc: "Stream to Medplum and reconcile audit log",
    icon: Send,
    doneWhenLoaded: false,
    idleTag: "Final",
  },
];

export default function Step1SourceIntake({
  fileData,
  datasetName,
  setDatasetName,
  targetResource,
  setTargetResource,
  selectedColumns = [],
  setSelectedColumns,
  presetApplied = false,
  onFileUpload,
  onLoadSample,
  onProceed,
  busy,
}) {
  const [sourceMode, setSourceMode] = useState("upload"); // "upload" | "sample"
  const [showPreview, setShowPreview] = useState(false);
  const [showColumns, setShowColumns] = useState(false);

  const allCols = fileData?.headers || [];
  const activeCols = selectedColumns.length > 0 ? selectedColumns : allCols;

  const toggleCol = (col) => {
    if (!setSelectedColumns) return;
    if (activeCols.includes(col)) {
      if (activeCols.length <= 1) return; // keep at least 1 column
      setSelectedColumns(activeCols.filter((c) => c !== col));
    } else {
      setSelectedColumns(allCols.filter((c) => c === col || activeCols.includes(c)));
    }
  };

  return (
    <div className="space-y-5">
      {/* Phase Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-bold tracking-tight text-[var(--text-primary)]">
            Phase 1: Upload &amp; Describe
          </h2>
          <p className="m-0 text-xs text-[var(--text-muted)]">
            Provide your clinical dataset and target FHIR R4 resource.
          </p>
        </div>

        <Button
          variant="primary"
          disabled={!fileData}
          onClick={onProceed}
        >
          <span>Next Step</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Two-Column Intake Grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
        {/* Left Column: Source Data */}
        <Card className="lg:col-span-7">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  SOURCE DATA
                </div>
                <h3 className="m-0 text-base font-bold text-[var(--text-primary)]">
                  Upload Clinical File
                </h3>
              </div>

              <SegmentedTabs
                ariaLabel="Source input mode"
                value={sourceMode}
                onChange={setSourceMode}
                items={[
                  { value: "upload", label: "File Upload", icon: UploadCloud },
                  { value: "sample", label: "Sample Dataset", icon: Zap },
                ]}
              />
            </div>

            {sourceMode === "upload" ? (
              <DropZone
                onFileSelected={onFileUpload}
                busy={busy === "upload"}
                disabled={Boolean(busy)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-subtle)]/70 px-6 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] text-[var(--brand)]">
                  <Zap className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-bold text-[var(--text-primary)]">
                    PlanData Patient Sample
                  </div>
                  <p className="m-0 text-xs text-[var(--text-muted)]">
                    Built-in clinical table (10 rows) for quick end-to-end testing.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  loading={busy === "upload"}
                  onClick={onLoadSample}
                >
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                  Load Sample Data
                </Button>
              </div>
            )}

            {/* Inline Dataset Config & Collapsible Preview */}
            {fileData && (
              <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)]/50 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileSpreadsheet className="h-4 w-4 shrink-0 text-[var(--brand)]" aria-hidden="true" />
                    <code className="truncate text-xs font-semibold text-[var(--text-primary)]">
                      {fileData.filename}
                    </code>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone="brand">{fileData.total_rows} rows</Badge>
                    <Badge tone="ok">{activeCols.length}/{allCols.length} cols</Badge>
                    {presetApplied && (
                      <Badge tone="ai">Last setting</Badge>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                      <label
                        htmlFor="step1-dataset-tag"
                        className="block text-xs font-semibold text-[var(--text-secondary)]"
                      >
                        Tag
                      </label>
                      <input
                        id="step1-dataset-tag"
                        type="text"
                        value={datasetName}
                        onChange={(e) => setDatasetName(e.target.value)}
                        className="h-[34px] w-[160px] rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="step1-target-res"
                        className="block text-xs font-semibold text-[var(--text-secondary)]"
                      >
                        Resource
                      </label>
                      <select
                        id="step1-target-res"
                        value={RESOURCE_TARGETS.includes(targetResource) ? targetResource : "Patient"}
                        onChange={(e) => setTargetResource(e.target.value)}
                        className="h-[34px] rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-xs"
                      >
                        {RESOURCE_TARGETS.map((res) => (
                          <option key={res} value={res}>
                            {res}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {setSelectedColumns && allCols.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-expanded={showColumns}
                        onClick={() => setShowColumns((v) => !v)}
                      >
                        Columns ({activeCols.length}/{allCols.length})
                      </Button>
                    )}
                    {fileData.sample_rows?.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-expanded={showPreview}
                        onClick={() => setShowPreview((v) => !v)}
                      >
                        {showPreview ? (
                          <>
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                            Hide Preview
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                            Preview ({Math.min(3, fileData.sample_rows.length)} rows)
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {showColumns && setSelectedColumns && allCols.length > 0 && (
                  <div className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--text-secondary)]">
                        Choose columns for FHIR mapping
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedColumns(allCols)}
                        >
                          Reset to All
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const core = allCols.filter((c) => !AUDIT_COL_RE.test(c));
                            setSelectedColumns(core.length > 0 ? core : allCols);
                          }}
                        >
                          FHIR Core
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto">
                      {allCols.map((col) => {
                        const checked = activeCols.includes(col);
                        return (
                          <label
                            key={col}
                            className="inline-flex items-center gap-1.5 rounded border border-[var(--border-default)] bg-[var(--bg-subtle)]/60 px-2 py-1 text-xs font-mono cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCol(col)}
                              className="h-3.5 w-3.5 accent-[var(--brand)]"
                            />
                            <span>{col}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {showPreview && fileData.sample_rows?.length > 0 && (
                  <div className="max-h-[200px] overflow-auto rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)]">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="sticky top-0 bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                        <tr className="border-b border-[var(--border-default)]">
                          {fileData.headers.map((h) => (
                            <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-mono font-semibold">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-default)]">
                        {fileData.sample_rows.slice(0, 3).map((row, i) => (
                          <tr key={i}>
                            {fileData.headers.map((h) => (
                              <td
                                key={h}
                                className="whitespace-nowrap px-3 py-2 font-mono text-[var(--text-primary)]"
                              >
                                {row[h] !== undefined && row[h] !== null && row[h] !== ""
                                  ? String(row[h])
                                  : "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column: What We'll Do */}
        <Card className="lg:col-span-5">
          <CardContent className="space-y-4 p-5">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--brand)]">
                WHAT WE&apos;LL DO
              </div>
              <h3 className="m-0 text-base font-bold text-[var(--text-primary)]">
                Autonomous FHIR Pipeline
              </h3>
            </div>

            <p className="m-0 text-xs leading-relaxed text-[var(--text-muted)]">
              Upload a file to start. Four stages run in sequence:
            </p>

            <ol className="m-0 list-none space-y-2.5 p-0">
              {PIPELINE_STAGES.map((st) => {
                const Icon = st.icon;
                const isDone = Boolean(fileData && st.doneWhenLoaded);
                return (
                  <li
                    key={st.num}
                    className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)]/50 px-3 py-2.5"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--brand)]">
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[var(--text-primary)]">
                          {st.num}. {st.name}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {st.desc}
                        </div>
                      </div>
                    </div>

                    <Badge tone={isDone ? "ok" : "neutral"} className="shrink-0">
                      {isDone ? "Done" : st.idleTag}
                    </Badge>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
