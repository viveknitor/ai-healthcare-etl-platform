import React, { useState, useEffect, useMemo } from "react";
import {
  User,
  FlaskConical,
  Stethoscope,
  Building2,
  ShieldCheck,
  Send,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Download,
  Braces,
  Search,
  ExternalLink,
  CheckCircle2,
  Package,
  Zap,
  Database,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api.js";
import { useAppStore } from "@/stores/useAppStore.js";
import { exportPipelineBatchCsv, downloadJsonFile } from "@/utils/exportReports.js";
import AgentWorkflowVisualizer from "@/components/AgentWorkflowVisualizer.jsx";
import InspectRecordModal from "@/components/modals/InspectRecordModal.jsx";
import MetricCard from "@/components/layout/MetricCard.jsx";
import DataTableShell from "@/components/ui/DataTableShell.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import { cn } from "@/utils/cn.js";

const STATUS_TONE = { delivered: "ok", dry_run: "brand", invalid: "warn", failed: "bad" };
const STORAGE_KEY = "healthcare_etl_pipeline_report";
const STORAGE_COUNT_KEY = "healthcare_etl_pipeline_count";
const STORAGE_OFFSET_KEY = "healthcare_etl_pipeline_offset";
const STORAGE_RESOURCE_KEY = "healthcare_etl_pipeline_resource";

const RESOURCE_OPTIONS = [
  { value: "Patient", label: "Patient", sub: "Demographics", icon: User },
  { value: "Observation", label: "Observation", sub: "Labs & Vitals", icon: FlaskConical },
  { value: "Condition", label: "Condition", sub: "Diagnoses", icon: Stethoscope },
  { value: "Encounter", label: "Encounter", sub: "Visits", icon: Building2 },
];

export default function PipelinePage() {
  const openConfirm = useAppStore((s) => s.openConfirm);
  const setActiveBatch = useAppStore((s) => s.setActiveBatch);
  const refreshHealthAndStats = useAppStore((s) => s.refreshHealthAndStats);

  const [resourceType, setResourceType] = useState(
    () => localStorage.getItem(STORAGE_RESOURCE_KEY) || "Patient"
  );
  const [count, setCount] = useState(
    () => Number(localStorage.getItem(STORAGE_COUNT_KEY)) || 5
  );
  const [offset, setOffset] = useState(
    () => Number(localStorage.getItem(STORAGE_OFFSET_KEY)) || 0
  );
  const [dryRun, setDryRun] = useState(true);
  const [isValidated, setIsValidated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeRecord, setActiveRecord] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const [report, setReport] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (report) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(report));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [report]);

  useEffect(() => {
    localStorage.setItem(STORAGE_COUNT_KEY, String(count));
  }, [count]);

  useEffect(() => {
    localStorage.setItem(STORAGE_OFFSET_KEY, String(offset));
  }, [offset]);

  useEffect(() => {
    localStorage.setItem(STORAGE_RESOURCE_KEY, resourceType);
  }, [resourceType]);

  useEffect(() => {
    setActiveBatch({
      datasetName: `HAPI ${resourceType}`,
      rowCount: report?.summary?.total ?? count,
      targetResource: resourceType,
    });
  }, [resourceType, report?.summary?.total, count, setActiveBatch]);

  async function executePipeline(
    isDryRun = dryRun,
    customOffset = offset,
    customResType = resourceType
  ) {
    if (!isDryRun) {
      const confirmed = await openConfirm({
        title: `Deliver ${count} ${customResType} records to Medplum?`,
        description: `Records from source offset ${customOffset} will be conditionally upserted into local Medplum (http://localhost:8103).`,
        confirmLabel: `Deliver ${count} ${customResType} Records`,
        tone: "success",
      });
      if (!confirmed) return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await api.runPipeline(
        Number(count),
        isDryRun,
        Number(customOffset),
        customResType
      );
      setReport(data);
      if (isDryRun) {
        const hasErr =
          (data?.summary?.counts?.invalid || 0) > 0 ||
          (data?.summary?.counts?.failed || 0) > 0;
        const ok = !hasErr && (data?.results?.length || 0) > 0;
        setIsValidated(ok);
        if (ok) {
          toast.success(`Validated ${data.results.length} ${customResType} records`);
        } else {
          toast.warning("Validation completed with quarantined records");
        }
      } else {
        toast.success(
          `Delivered ${data?.summary?.counts?.delivered || 0} ${customResType} records to Medplum`
        );
      }
      refreshHealthAndStats();
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
      if (isDryRun) setIsValidated(false);
    } finally {
      setLoading(false);
    }
  }

  function nextBatch() {
    setIsValidated(false);
    const newOffset = offset + count;
    setOffset(newOffset);
    setDryRun(true);
    executePipeline(true, newOffset, resourceType);
  }

  function prevBatch() {
    setIsValidated(false);
    const newOffset = Math.max(0, offset - count);
    setOffset(newOffset);
    setDryRun(true);
    executePipeline(true, newOffset, resourceType);
  }

  async function clearResults() {
    const confirmed = await openConfirm({
      title: "Clear cached pipeline results?",
      description: "This clears the local UI table cache. It does not delete records in Medplum.",
      confirmLabel: "Clear Results",
      tone: "danger",
    });
    if (!confirmed) return;
    setReport(null);
    setIsValidated(false);
    localStorage.removeItem(STORAGE_KEY);
    setActiveRecord(null);
    toast.info("Pipeline table cleared");
  }

  const handleDownloadCsv = () => {
    const res = exportPipelineBatchCsv({
      results: report?.results || [],
      resourceType,
      offset,
    });
    if (res.ok) toast.success(`Exported ${res.count} rows to ${res.filename}`);
  };

  const handleDownloadJson = () => {
    if (!report) return;
    const filename = `HAPI_to_Medplum_${resourceType}_Offset${offset}_Bundle.json`;
    downloadJsonFile(report, filename);
    toast.success(`Downloaded ${filename}`);
  };

  const deliveredCount = report?.summary?.counts?.delivered || 0;
  const totalCount = report?.summary?.total || 0;

  const rawResults = report?.results || [];
  const filteredResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return rawResults.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (!term) return true;
      const s = r.patient_summary || {};
      const m = r.mapping_details || {};
      return (
        (r.source_id && String(r.source_id).toLowerCase().includes(term)) ||
        (r.target_id && String(r.target_id).toLowerCase().includes(term)) ||
        (s.title && String(s.title).toLowerCase().includes(term)) ||
        (s.code && String(s.code).toLowerCase().includes(term)) ||
        (s.primary_value && String(s.primary_value).toLowerCase().includes(term)) ||
        (m.idempotent_identifier && String(m.idempotent_identifier).toLowerCase().includes(term))
      );
    });
  }, [rawResults, statusFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedResults = filteredResults.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const filterOptions = [
    { id: "ALL", label: "All", count: rawResults.length },
    ...["delivered", "dry_run", "invalid", "failed"]
      .map((st) => ({
        id: st,
        label: st === "dry_run" ? "Validated" : st.charAt(0).toUpperCase() + st.slice(1),
        count: rawResults.filter((r) => r.status === st).length,
      }))
      .filter((o) => o.count > 0),
  ];

  return (
    <section className="space-y-5">
      {/* 1. KPI Summary Bar */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Batch"
          value={`${totalCount}`}
          subvalue="HAPI FHIR"
          icon={Package}
          tone="neutral"
        />
        <MetricCard
          title="Delivered"
          value={`${deliveredCount}`}
          subvalue="Medplum"
          icon={Zap}
          tone="ok"
        />
        <MetricCard
          title="Target"
          value="Medplum :8103"
          subvalue="PostgreSQL"
          icon={Database}
          tone="brand"
        />
        <MetricCard
          title="Standard"
          value="FHIR R4"
          subvalue="Auto-parent"
          icon={ShieldCheck}
          tone="ai"
        />
      </div>

      {/* 2. Sync Control Card */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-sm)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-base font-bold text-[var(--text-primary)]">
            HAPI → Medplum Sync
          </h2>
          <div className="flex items-center gap-2">
            {isValidated && (
              <Badge tone="ok" icon={CheckCircle2}>
                Validated
              </Badge>
            )}
            {report && (
              <Button size="sm" variant="danger" onClick={clearResults}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Resource Type Selector */}
        <div
          role="group"
          aria-label="FHIR resource type"
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        >
          {RESOURCE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = resourceType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setResourceType(opt.value);
                  setOffset(0);
                  setIsValidated(false);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-[var(--radius-md)] border px-3.5 py-2.5 text-left transition-colors cursor-pointer",
                  active
                    ? "border-[var(--brand-border)] bg-[var(--brand-bg)] text-[var(--brand)] etl-active-ring"
                    : "border-[var(--border-default)] bg-[var(--bg-subtle)]/50 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-xs font-bold">{opt.label}</div>
                  <div className="truncate text-xs text-[var(--text-muted)]">{opt.sub}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Batch Parameters & Execution Bar */}
        <div className="flex flex-wrap items-end justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)]/70 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor="sync-batch-size" className="block text-xs font-semibold text-[var(--text-secondary)]">
                Count
              </label>
              <input
                id="sync-batch-size"
                type="text"
                inputMode="numeric"
                value={count}
                onChange={(e) => {
                  const val = parseInt(e.target.value.replace(/\D/g, ""), 10);
                  setCount(Number.isNaN(val) ? 1 : Math.min(100, Math.max(1, val)));
                  setIsValidated(false);
                }}
                className="h-[36px] w-[96px] rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="sync-offset" className="block text-xs font-semibold text-[var(--text-secondary)]">
                Offset
              </label>
              <input
                id="sync-offset"
                type="text"
                inputMode="numeric"
                value={offset}
                onChange={(e) => {
                  const val = parseInt(e.target.value.replace(/\D/g, ""), 10);
                  setOffset(Number.isNaN(val) ? 0 : Math.max(0, val));
                  setIsValidated(false);
                }}
                className="h-[36px] w-[96px] rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              disabled={loading || offset <= 0}
              onClick={prevBatch}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Prev
            </Button>

            <Button
              variant="secondary"
              loading={loading && dryRun}
              disabled={loading && !dryRun}
              onClick={() => {
                setDryRun(true);
                executePipeline(true, offset, resourceType);
              }}
            >
              {!(loading && dryRun) && <ShieldCheck className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" />}
              {loading && dryRun ? "Validating…" : `Validate (${count})`}
            </Button>

            <Button
              variant="success"
              loading={loading && !dryRun}
              disabled={loading || !isValidated}
              onClick={() => {
                setDryRun(false);
                executePipeline(false, offset, resourceType);
              }}
            >
              {!(loading && !dryRun) && <Send className="h-4 w-4" aria-hidden="true" />}
              {loading && !dryRun
                ? "Delivering…"
                : deliveredCount > 0
                ? `Delivered (${deliveredCount})`
                : `Deliver (${count})`}
            </Button>

            <Button variant="secondary" disabled={loading} onClick={nextBatch}>
              Next
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {!isValidated && (
          <div className="text-xs text-[var(--text-muted)]">
            Validate before delivering.
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--bad-border)] bg-[var(--bad-bg)] px-3.5 py-2.5 text-xs font-medium text-[var(--bad)]"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* 4. Pipeline Results or First-Run Empty State */}
      {!report ? (
        <EmptyState
          variant="first-run"
          title={`Ready to inspect HAPI FHIR ${resourceType} records`}
          description={`Run Validate & Verify Schema to fetch ${count} ${resourceType} resource(s) from HAPI FHIR (offset ${offset}) in safe dry-run mode.`}
          actionLabel={`Validate ${count} ${resourceType} Records`}
          onAction={() => {
            setDryRun(true);
            executePipeline(true, offset, resourceType);
          }}
        />
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-sm)] space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="m-0 text-base font-bold text-[var(--text-primary)]">
                  Ingestion Results: {resourceType}
                </h3>
                <Badge tone="info">
                  Offset {offset} • #{offset + 1}–#{offset + (report.results?.length || count)}
                </Badge>
                {deliveredCount > 0 && (
                  <Badge tone="ok" icon={CheckCircle2}>
                    Persisted to Medplum
                  </Badge>
                )}
              </div>
              <p className="m-0 mt-0.5 text-xs text-[var(--text-muted)]">
                Cached locally across reloads. Select Inspect on any row to verify live Medplum database persistence.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={handleDownloadCsv}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                CSV
              </Button>
              <Button size="sm" variant="secondary" onClick={handleDownloadJson}>
                <Braces className="h-3.5 w-3.5" aria-hidden="true" />
                JSON
              </Button>
            </div>
          </div>

          <DataTableShell
            searchTerm={searchTerm}
            onSearchChange={(val) => {
              setSearchTerm(val);
              setCurrentPage(1);
            }}
            searchPlaceholder={`Search ${resourceType} ID or name…`}
            filterOptions={filterOptions}
            activeFilter={statusFilter}
            onFilterChange={(id) => {
              setStatusFilter(id);
              setCurrentPage(1);
            }}
            pageSize={pageSize}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setCurrentPage(1);
            }}
            currentPage={safePage}
            totalPages={totalPages}
            totalFiltered={filteredResults.length}
            onPageChange={setCurrentPage}
          >
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border-default)]">
                  <th scope="col" className="w-[5%] px-3 py-2.5 font-semibold">#</th>
                  <th scope="col" className="w-[22%] px-3 py-2.5 font-semibold">Source {resourceType} (HAPI)</th>
                  <th scope="col" className="w-[20%] px-3 py-2.5 font-semibold">Clinical Metric / Demographics</th>
                  <th scope="col" className="w-[25%] px-3 py-2.5 font-semibold">Cross-Resource Links &amp; Identity</th>
                  <th scope="col" className="w-[14%] px-3 py-2.5 font-semibold">Target Medplum</th>
                  <th scope="col" className="w-[8%] px-3 py-2.5 font-semibold">Status</th>
                  <th scope="col" className="w-[6%] px-3 py-2.5 font-semibold text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {paginatedResults.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4">
                      <EmptyState
                        variant="filtered"
                        title={`No records match "${searchTerm || statusFilter}"`}
                        description="Reset your search query or status filter to view all records in this batch."
                        actionLabel="Clear Filters"
                        onAction={() => {
                          setSearchTerm("");
                          setStatusFilter("ALL");
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  paginatedResults.map((r, i) => {
                    const s = r.patient_summary || {};
                    const m = r.mapping_details || {};
                    const deliveryAction = m.delivery_action;
                    const rowIdx = (safePage - 1) * pageSize + i + 1;

                    return (
                      <tr key={`${r.source_id}-${rowIdx}`} className="hover:bg-[var(--bg-subtle)]/50">
                        <td className="px-3 py-2.5 tabular-nums font-semibold text-[var(--text-muted)]">
                          {offset + rowIdx}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-[var(--text-primary)]">{s.title || "Unknown"}</div>
                          <div className="font-mono text-xs text-[var(--text-muted)]">
                            ID: {r.source_id}
                            {s.code && s.code !== "—" ? ` • ${s.code}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-[var(--brand)]">{s.primary_value || "—"}</div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {s.subtitle || s.secondary_value || "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 space-y-1">
                          <code className="inline-block rounded border border-[var(--brand-border)] bg-[var(--brand-bg)] px-1.5 py-0.5 text-xs text-[var(--brand)]">
                            {m.idempotent_identifier || `urn:source:hapi|${r.source_id}`}
                          </code>
                          {s.subject_reference && s.subject_reference !== "—" && (
                            <div className="font-mono text-xs text-[var(--text-muted)]">
                              {s.subject_reference} → {m.target_subject_reference}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {r.target_id ? (
                            <div>
                              <a
                                href={`http://localhost:3000/${resourceType}/${r.target_id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-[var(--brand)] hover:underline"
                              >
                                <span>{r.target_id.slice(0, 14)}…</span>
                                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                              </a>
                              <div className="text-xs text-[var(--ok)] font-medium">
                                {deliveryAction === "created" ? "Newly Created" : "Updated Existing"}
                              </div>
                            </div>
                          ) : r.status === "dry_run" ? (
                            <span className="text-xs text-[var(--text-muted)]">Validated (Pending Commit)</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-col items-start gap-1">
                            <Badge tone={STATUS_TONE[r.status] || "neutral"}>
                              {r.status === "dry_run" ? "validated" : r.status}
                            </Badge>
                            {deliveryAction && (
                              <Badge tone={deliveryAction === "created" ? "ok" : "info"}>
                                {deliveryAction}
                              </Badge>
                            )}
                          </div>
                          {r.errors && r.errors.length > 0 && (
                            <div className="mt-1 text-xs text-[var(--bad)]">{r.errors.join("; ")}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Button size="sm" variant="secondary" onClick={() => setActiveRecord(r)}>
                            <Search className="h-3.5 w-3.5" aria-hidden="true" />
                            Inspect
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </DataTableShell>
        </div>
      )}

      <AgentWorkflowVisualizer
        defaultCollapsed={true}
        datasetName={`HAPI FHIR R4 (${resourceType})`}
        recordsCount={count}
        approved={true}
        validated={isValidated}
        delivered={deliveredCount > 0}
        onApprove={() => {}}
      />

      {/* Unified Inspector Modal (shared with UploadPage) */}
      <InspectRecordModal
        activeRecord={activeRecord}
        targetResource={resourceType}
        sourceLabel="Source Payload (HAPI)"
        enableDestinationTab={true}
        onClose={() => setActiveRecord(null)}
      />
    </section>
  );
}
