import React, { useState } from "react";
import {
  Table2,
  GitMerge,
  Braces,
  Plus,
  Trash2,
  Copy,
  Check,
  Download,
  Sparkles,
  Search,
  X,
  ArrowRight,
  Info,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { downloadJsonFile } from "@/utils/exportReports.js";
import SegmentedTabs from "@/components/ui/Tabs.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import { cn } from "@/utils/cn.js";

export default function MappingContractViewer({
  mapping,
  onEditRule,
  onRemoveRule,
  onAddRule,
  onSaveContract,
  savingContract = false,
  approved,
  allHeaders = [],
  mappedSources = new Set(),
  unmappedHeaders = [],
  onMapAllRemaining,
  onMapSingleExtension,
}) {
  const [viewMode, setViewMode] = useState("table"); // "table" | "flow" | "json"
  const [copied, setCopied] = useState(false);
  const [ruleSearch, setRuleSearch] = useState("");
  const [ruleFilter, setRuleFilter] = useState("ALL"); // "ALL" | "REQUIRED" | "OPTIONAL"
  const [showAddRuleForm, setShowAddRuleForm] = useState(false);
  const [newSrc, setNewSrc] = useState("");
  const [newTgt, setNewTgt] = useState("extension[0].valueString");
  const [newTransform, setNewTransform] = useState("direct");
  const [openRationaleIdx, setOpenRationaleIdx] = useState(null);

  if (!mapping) return null;

  const rules = mapping.rules || [];
  const totalCols = allHeaders.length;
  const coveragePct = totalCols > 0 ? Math.round((mappedSources.size / Math.max(1, totalCols)) * 100) : 100;

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(mapping, null, 2));
      setCopied(true);
      toast.success("Copied mapping contract JSON");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const handleDownloadJson = () => {
    downloadJsonFile(mapping, `${mapping.name || "mapping"}.json`);
    toast.success(`Downloaded ${mapping.name || "mapping"}.json`);
  };

  const handleCreateCustomRule = (e) => {
    e.preventDefault();
    if (!newSrc.trim() || !newTgt.trim()) return;
    onAddRule?.({
      source: newSrc.trim(),
      target: newTgt.trim(),
      transform: newTransform,
    });
    setNewSrc("");
    setNewTgt(`extension[${rules.filter((r) => r.target?.startsWith("extension[")).length + 1}].valueString`);
    setNewTransform("direct");
    setShowAddRuleForm(false);
    toast.success(`Added rule for "${newSrc.trim()}" (status reverted to Pending Review)`);
  };

  const filteredRules = rules.filter((r) => {
    if (ruleFilter === "REQUIRED" && !r.required) return false;
    if (ruleFilter === "OPTIONAL" && r.required) return false;
    if (ruleSearch.trim()) {
      const q = ruleSearch.toLowerCase();
      return (
        String(r.source || "").toLowerCase().includes(q) ||
        String(r.target || "").toLowerCase().includes(q) ||
        String(r.transform || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-sm)] space-y-4">
      {/* Header & Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-base font-bold text-[var(--text-primary)]">
              Mapping Contract: <code className="text-[var(--brand)]">{mapping.name}</code>
            </h3>
            <Badge tone={approved ? "ok" : "warn"}>
              {approved ? "Approved Contract" : "Pending Review"}
            </Badge>
          </div>
          <p className="m-0 mt-0.5 text-xs text-[var(--text-muted)]">
            Deterministic HL7 FHIR R4 transformation contract. Manual edits safely reset status to Pending Review.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedTabs
            ariaLabel="Contract view mode"
            value={viewMode}
            onChange={setViewMode}
            items={[
              { value: "table", label: "Interactive Table", icon: Table2 },
              { value: "flow", label: "Lineage & Flow", icon: GitMerge },
              { value: "json", label: "Raw JSON Spec", icon: Braces },
            ]}
          />
          {onSaveContract && (
            <Button
              size="sm"
              variant="secondary"
              loading={savingContract}
              onClick={onSaveContract}
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              Save Contract
            </Button>
          )}
        </div>
      </div>

      {/* Field Coverage Bar */}
      {totalCols > 0 && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)]/70 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
              <strong className="text-[var(--text-primary)]">Field Coverage:</strong>
              <span className="font-bold text-[var(--ok)]">{mappedSources.size} Mapped</span>
              <span className="text-[var(--text-muted)]">•</span>
              <span
                className={cn(
                  "font-bold",
                  unmappedHeaders.length > 0 ? "text-[var(--warn)]" : "text-[var(--ok)]"
                )}
              >
                {unmappedHeaders.length} Unmapped
              </span>
              <span className="text-[var(--text-muted)]">/ {totalCols} Columns</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={unmappedHeaders.length === 0 ? "ok" : "warn"}>
                {coveragePct}% Coverage
              </Badge>
              {unmappedHeaders.length > 0 && onMapAllRemaining && (
                <Button size="sm" variant="primary" onClick={onMapAllRemaining}>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Map All {unmappedHeaders.length} Remaining as Extensions (100%)
                </Button>
              )}
            </div>
          </div>

          {/* Coverage progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-muted)]">
            <div
              className={cn(
                "h-full transition-[width] duration-200",
                unmappedHeaders.length === 0 ? "bg-[var(--ok)]" : "bg-[var(--brand)]"
              )}
              style={{ width: `${coveragePct}%` }}
            />
          </div>

          {unmappedHeaders.length > 0 && onMapSingleExtension && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[var(--text-muted)]">Map individually as extension:</span>
              {unmappedHeaders.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => onMapSingleExtension(col)}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--warn-border)] bg-[var(--warn-bg)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--warn)] hover:brightness-95 cursor-pointer"
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  {col}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 1: INTERACTIVE TABLE */}
      {viewMode === "table" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex items-center">
                <Search
                  className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--text-muted)]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Search mapping rules"
                  placeholder="Search source, target, or transform…"
                  value={ruleSearch}
                  onChange={(e) => setRuleSearch(e.target.value)}
                  className="h-[32px] w-[240px] rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] pl-8 pr-7 text-xs"
                />
                {ruleSearch && (
                  <button
                    type="button"
                    aria-label="Clear rule search"
                    onClick={() => setRuleSearch("")}
                    className="absolute right-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              {[
                { id: "ALL", label: "All", count: rules.length },
                { id: "REQUIRED", label: "Required", count: rules.filter((r) => r.required).length },
                { id: "OPTIONAL", label: "Optional", count: rules.filter((r) => !r.required).length },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={ruleFilter === f.id}
                  onClick={() => setRuleFilter(f.id)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-semibold tabular-nums cursor-pointer",
                    ruleFilter === f.id
                      ? "bg-[var(--brand)] border-[var(--brand)] text-[var(--brand-fg)] etl-active-ring"
                      : "bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                  )}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>

            {onAddRule && (
              <Button
                size="sm"
                variant={showAddRuleForm ? "primary" : "secondary"}
                aria-expanded={showAddRuleForm}
                onClick={() => setShowAddRuleForm((v) => !v)}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add Custom Rule
              </Button>
            )}
          </div>

          {/* Inline Custom Rule Form (replaces browser prompt()) */}
          {showAddRuleForm && onAddRule && (
            <form
              onSubmit={handleCreateCustomRule}
              className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-bg)]/40 p-3.5 sm:grid-cols-4 items-end"
            >
              <div className="space-y-1">
                <label htmlFor="new-rule-src" className="block text-xs font-semibold text-[var(--text-primary)]">
                  Source Column
                </label>
                <input
                  id="new-rule-src"
                  type="text"
                  list="mapping-source-cols"
                  required
                  value={newSrc}
                  onChange={(e) => setNewSrc(e.target.value)}
                  placeholder="e.g. memid"
                  className="h-[32px] w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-xs"
                />
                {allHeaders.length > 0 && (
                  <datalist id="mapping-source-cols">
                    {allHeaders.map((h) => (
                      <option key={h} value={h} />
                    ))}
                  </datalist>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="new-rule-tgt" className="block text-xs font-semibold text-[var(--text-primary)]">
                  Target FHIR Path
                </label>
                <input
                  id="new-rule-tgt"
                  type="text"
                  required
                  value={newTgt}
                  onChange={(e) => setNewTgt(e.target.value)}
                  placeholder="extension[0].valueString"
                  className="h-[32px] w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="new-rule-tx" className="block text-xs font-semibold text-[var(--text-primary)]">
                  Transform
                </label>
                <select
                  id="new-rule-tx"
                  value={newTransform}
                  onChange={(e) => setNewTransform(e.target.value)}
                  className="h-[32px] w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 text-xs"
                >
                  <option value="direct">direct</option>
                  <option value="date">date</option>
                  <option value="map">map</option>
                  <option value="upper">upper</option>
                  <option value="lower">lower</option>
                  <option value="strip">strip</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setShowAddRuleForm(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" type="submit">
                  Add Rule
                </Button>
              </div>
            </form>
          )}

          {/* Rules Table */}
          <div className="max-h-[440px] overflow-auto rounded-[var(--radius-md)] border border-[var(--border-default)]">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border-default)]">
                  <th scope="col" className="w-[21%] px-3 py-2.5 font-semibold">Source Column</th>
                  <th scope="col" className="w-[29%] px-3 py-2.5 font-semibold">Target FHIR Path</th>
                  <th scope="col" className="w-[15%] px-3 py-2.5 font-semibold">Transform</th>
                  <th scope="col" className="w-[13%] px-3 py-2.5 font-semibold">Confidence</th>
                  <th scope="col" className="w-[10%] px-3 py-2.5 font-semibold">Type</th>
                  <th scope="col" className="w-[12%] px-3 py-2.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)] bg-[var(--bg-surface)]">
                {filteredRules.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4">
                      <EmptyState
                        variant="filtered"
                        title={`No rules match "${ruleSearch || ruleFilter}"`}
                        description="Reset search or filter options to display all transformation rules."
                        actionLabel="Clear Filters"
                        onAction={() => {
                          setRuleSearch("");
                          setRuleFilter("ALL");
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredRules.map((r) => {
                    const i = rules.indexOf(r);
                    const pct = Math.round((r.confidence ?? 1) * 100);
                    const hasNotes = Boolean(r.rationale || r.notes);
                    const rationaleOpen = openRationaleIdx === i;

                    return (
                      <React.Fragment key={`${r.source}-${r.target}-${i}`}>
                        <tr className="hover:bg-[var(--bg-subtle)]/50">
                          <td className="px-3 py-2">
                            <input
                              aria-label={`Source field for rule ${i + 1}`}
                              value={r.source}
                              onChange={(e) => onEditRule(i, "source", e.target.value)}
                              className="h-[30px] w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 text-xs font-medium"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              aria-label={`Target FHIR path for ${r.source}`}
                              value={r.target}
                              onChange={(e) => onEditRule(i, "target", e.target.value)}
                              className="h-[30px] w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 font-mono text-xs"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              aria-label={`Transform for ${r.source}`}
                              value={r.transform || "direct"}
                              onChange={(e) => onEditRule(i, "transform", e.target.value)}
                              className="h-[30px] w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 text-xs"
                            >
                              <option value="direct">direct</option>
                              <option value="date">date</option>
                              <option value="map">map</option>
                              <option value="upper">upper</option>
                              <option value="lower">lower</option>
                              <option value="strip">strip</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge tone={pct >= 90 ? "ok" : "warn"}>{pct}%</Badge>
                              {(r.notes?.includes("Self-healed") || r.notes?.includes("healed")) && (
                                <Badge tone="ai">Healed</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={r.required ? "warn" : "neutral"}>
                              {r.required ? "Required" : "Optional"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex items-center gap-1">
                              {hasNotes && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-expanded={rationaleOpen}
                                  aria-label={`View rationale for ${r.source}`}
                                  title="View AI rationale"
                                  onClick={() => setOpenRationaleIdx(rationaleOpen ? null : i)}
                                >
                                  <Info className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden="true" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="danger"
                                aria-label={`Remove rule for ${r.source}`}
                                title={`Remove rule for ${r.source}`}
                                onClick={() => onRemoveRule(i)}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {rationaleOpen && hasNotes && (
                          <tr className="bg-[var(--bg-subtle)]/70">
                            <td colSpan={6} className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                              <strong className="text-[var(--text-primary)]">AI Rationale:</strong>{" "}
                              {r.rationale || r.notes}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: LINEAGE & FLOW */}
      {viewMode === "flow" && (
        <div className="grid max-h-[420px] gap-2.5 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)]/60 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {rules.map((r, i) => (
            <div
              key={`${r.source}-${i}`}
              className="flex flex-col gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[var(--text-primary)]">{r.source}</span>
                <Badge tone="brand">{r.transform || "direct"}</Badge>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[var(--ok)] break-all">
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                <span>{r.target}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* VIEW 3: RAW JSON CONTRACT */}
      {viewMode === "json" && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-[var(--text-muted)]">
              Declarative contract: <code>mappings/{(mapping.name || "mapping").toLowerCase()}.json</code>
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={copyJson}>
                {copied ? <Check className="h-3.5 w-3.5 text-[var(--ok)]" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                {copied ? "Copied" : "Copy JSON"}
              </Button>
              <Button size="sm" variant="secondary" onClick={handleDownloadJson}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download .json
              </Button>
            </div>
          </div>

          <pre
            translate="no"
            className="max-h-[420px] rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-code)] p-4 text-xs text-[var(--text-primary)]"
          >
            {JSON.stringify(mapping, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
