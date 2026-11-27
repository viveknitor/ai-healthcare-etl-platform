import React from "react";
import {
  Send,
  Plus,
  Download,
  AlertTriangle,
  CheckCircle2,
  Braces,
  Search,
  Pencil,
  Trash2,
  ExternalLink,
  XCircle,
  Sparkles,
} from "lucide-react";
import { TableVirtuoso } from "react-virtuoso";
import {
  formatHumanTableRowError,
  groupFixableQuarantineIssues,
} from "@/utils/errorDiagnostics.js";
import DataTableShell from "@/components/ui/DataTableShell.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import { cn } from "@/utils/cn.js";

export default function Step4ReconciliationHub({
  fileData,
  report,
  mapping,
  targetResource,
  datasetName,
  busy,
  streamProgress,
  scenarioCounts,
  statusFilter,
  setStatusFilter,
  searchTerm,
  setSearchTerm,
  currentPage,
  setCurrentPage,
  pageSize,
  setPageSize,
  paginatedResults,
  filteredResults,
  totalPages,
  onRunIngestion,
  onCancelIngestion,
  onDownloadReport,
  onDownloadJSON,
  onStartAddRecord,
  onStartEdit,
  onDeleteRecord,
  onInspectRecord,
  onBulkFix,
}) {
  const validCount = (scenarioCounts.validated || 0) + (scenarioCounts.delivered || 0);
  const invalidCount = scenarioCounts.invalid || 0;
  const canDeliver = validCount > 0;
  const totalQuarantined = (scenarioCounts.invalid || 0) + (scenarioCounts.failed || 0);
  const fixableGroups = groupFixableQuarantineIssues(
    report?.results || [],
    fileData?.all_rows || []
  );

  const filterOptions = [
    { id: "ALL", label: "All", count: scenarioCounts.ALL },
    ...(scenarioCounts.delivered > 0
      ? [{ id: "delivered", label: "Delivered", count: scenarioCounts.delivered }]
      : []),
    ...(scenarioCounts.created > 0
      ? [{ id: "created", label: "Created", count: scenarioCounts.created }]
      : []),
    ...(scenarioCounts.updated > 0
      ? [{ id: "updated", label: "Updated", count: scenarioCounts.updated }]
      : []),
    ...(scenarioCounts.validated > 0
      ? [{ id: "validated", label: "Validated", count: scenarioCounts.validated }]
      : []),
    ...(scenarioCounts.invalid > 0
      ? [{ id: "invalid", label: "Quarantined", count: scenarioCounts.invalid }]
      : []),
    ...(scenarioCounts.failed > 0
      ? [{ id: "failed", label: "Failed", count: scenarioCounts.failed }]
      : []),
  ];

  const renderRowCells = (r, globalIdx) => {
    const s = r.patient_summary || {};
    const m = r.mapping_details || {};
    const deliveryAction = m.delivery_action;
    const isInvalid = r.status === "invalid" || (r.errors && r.errors.length > 0);

    return (
      <>
        <td className="px-3 py-2.5 tabular-nums font-semibold text-[var(--text-muted)]">
          {globalIdx + 1}
        </td>
        <td className="px-3 py-2.5">
          <div className="font-mono font-semibold text-[var(--text-primary)]">{r.source_id}</div>
          <div className="text-xs text-[var(--text-muted)]">Tag: {datasetName}</div>
        </td>
        <td className="px-3 py-2.5">
          <div className={cn("font-semibold", isInvalid ? "text-[var(--bad)]" : "text-[var(--text-primary)]")}>
            {s.title || "Record"}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {s.subtitle || s.primary_value || "—"}
          </div>
        </td>
        <td className="px-3 py-2.5">
          {r.target_id ? (
            <div>
              <a
                href={`http://localhost:3000/${targetResource}/${r.target_id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-[var(--brand)] hover:underline"
              >
                <span>{r.target_id.slice(0, 14)}…</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
              <div className="text-xs font-medium text-[var(--ok)]">
                {deliveryAction === "created" ? "Created in Medplum" : "Updated in Medplum"}
              </div>
            </div>
          ) : r.status === "dry_run" ? (
            <span className="text-xs text-[var(--ok)] font-medium">Validated (Ready)</span>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">—</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          {r.status === "delivered" ? (
            <Badge tone="ok">{deliveryAction === "created" ? "Created" : "Updated"}</Badge>
          ) : r.status === "dry_run" ? (
            <Badge tone="brand">Validated</Badge>
          ) : isInvalid ? (
            <Badge tone="bad">Quarantined</Badge>
          ) : (
            <Badge tone="bad">{r.status}</Badge>
          )}
          {r.errors && r.errors.length > 0 && (
            <div className="mt-1 text-xs text-[var(--bad)] leading-snug">
              {formatHumanTableRowError(r.errors[0], r.source_id)}
            </div>
          )}
        </td>
        <td className="px-3 py-2.5 text-right">
          <div className="inline-flex items-center gap-1">
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Inspect record ${r.source_id}`}
              onClick={() => onInspectRecord(r)}
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              Inspect
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Edit record ${r.source_id}`}
              onClick={() => onStartEdit(globalIdx, r)}
            >
              <Pencil className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden="true" />
              Edit
            </Button>
            <Button
              size="icon"
              variant="danger"
              aria-label={`Exclude record ${r.source_id}`}
              title={`Exclude ${r.source_id}`}
              onClick={() => onDeleteRecord(globalIdx)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </td>
      </>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header & Delivery Trigger */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-bold tracking-tight text-[var(--text-primary)]">
            Phase 4: Deliver &amp; Audit
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {busy === "ingest" && onCancelIngestion && (
            <Button size="sm" variant="danger" onClick={onCancelIngestion}>
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Cancel
            </Button>
          )}
          <Button
            variant="success"
            loading={busy === "ingest"}
            disabled={!canDeliver || (Boolean(busy) && busy !== "ingest")}
            onClick={() => onRunIngestion(false)}
          >
            {busy !== "ingest" && <Send className="h-4 w-4" aria-hidden="true" />}
            {busy === "ingest"
              ? "Delivering…"
              : invalidCount > 0
              ? `Deliver ${validCount} Valid`
              : `Deliver (${validCount || fileData?.total_rows || 0})`}
          </Button>
        </div>
      </div>

      {/* Live SSE Streaming Progress */}
      {streamProgress && (
        <div
          aria-live="polite"
          className="rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-sm)] space-y-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
            <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
              <span>
                {streamProgress.cancelled
                  ? "Streaming Cancelled"
                  : streamProgress.isComplete
                  ? "Ingestion Processing Complete"
                  : "Streaming Records to Medplum…"}
              </span>
              <Badge tone={streamProgress.isComplete ? "ok" : "brand"}>
                {streamProgress.current} / {streamProgress.total} ({streamProgress.percent}%)
              </Badge>
            </div>
            <span className="font-bold text-[var(--brand)]">
              {streamProgress.recordsPerSec} rec/sec
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-muted)]">
            <div
              className={cn(
                "h-full transition-[width] duration-150",
                streamProgress.isComplete ? "bg-[var(--ok)]" : "bg-[var(--brand)]"
              )}
              style={{ width: `${streamProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Results & Export Hub */}
      {report && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-sm)] space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="m-0 text-base font-bold text-[var(--text-primary)]">
                Batch Results: {fileData?.filename}
              </h3>
              <p className="m-0 mt-0.5 text-xs text-[var(--text-muted)] tabular-nums">
                Processed {report.results?.length || 0} of {report.summary?.total} records using{" "}
                <code>{mapping?.name}</code>.
              </p>
            </div>

            <Button size="sm" variant="primary" onClick={onStartAddRecord}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add Record
            </Button>
          </div>

          {/* Scenario KPI Summary & Export Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)]/70 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">Total: {report.summary?.total || 0}</Badge>
              {scenarioCounts.delivered > 0 && (
                <Badge tone="ok" icon={CheckCircle2}>
                  Delivered: {scenarioCounts.delivered} ({scenarioCounts.created} created,{" "}
                  {scenarioCounts.updated} updated)
                </Badge>
              )}
              {scenarioCounts.validated > 0 && (
                <Badge tone="brand">Validated: {scenarioCounts.validated}</Badge>
              )}
              {scenarioCounts.invalid > 0 && (
                <Badge tone="bad" icon={AlertTriangle}>
                  Quarantined: {scenarioCounts.invalid}
                </Badge>
              )}
              {scenarioCounts.failed > 0 && (
                <Badge tone="bad">Failed: {scenarioCounts.failed}</Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => onDownloadReport("full")}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Full Audit CSV ({report.results?.length || 0})
              </Button>
              <Button
                size="sm"
                variant={totalQuarantined > 0 ? "danger" : "secondary"}
                disabled={totalQuarantined === 0}
                onClick={() => onDownloadReport("quarantine")}
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                Quarantine ({totalQuarantined})
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={scenarioCounts.delivered === 0}
                onClick={() => onDownloadReport("manifest")}
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--ok)]" aria-hidden="true" />
                Manifest ({scenarioCounts.delivered})
              </Button>
              <Button size="sm" variant="secondary" onClick={onDownloadJSON}>
                <Braces className="h-3.5 w-3.5" aria-hidden="true" />
                JSON Bundle
              </Button>
            </div>
          </div>

          {/* 1-Click Bulk Quarantine Quick-Fix Bar (Zero-PHI Local) */}
          {fixableGroups.length > 0 && onBulkFix && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--warn-border)] bg-[var(--warn-bg)]/60 px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                <Sparkles className="h-4 w-4 shrink-0 text-[var(--warn)]" aria-hidden="true" />
                <span>Recurring format issues detected (fixed locally, zero PHI sent to AI):</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {fixableGroups.map((g) => (
                  <Button
                    key={g.category}
                    size="sm"
                    variant="primary"
                    loading={busy === "bulk_fix"}
                    disabled={Boolean(busy)}
                    onClick={() => onBulkFix(g)}
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    {g.buttonLabel} ({g.count})
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Search, Filter & Paginated/Virtualized Table */}
          <DataTableShell
            searchTerm={searchTerm}
            onSearchChange={(val) => {
              setSearchTerm(val);
              setCurrentPage(1);
            }}
            searchPlaceholder="Search ID, name, or UUID…"
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
            pageSizeOptions={[15, 25, 50, 100, 500]}
            currentPage={currentPage}
            totalPages={totalPages}
            totalFiltered={filteredResults.length}
            onPageChange={setCurrentPage}
          >
            {paginatedResults.length === 0 ? (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                  <tr className="border-b border-[var(--border-default)]">
                    <th scope="col" className="px-3 py-2.5 font-semibold">#</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Source Identifier</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Clinical / Demographics</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Target Medplum Link</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={6} className="p-4">
                      <EmptyState
                        variant="filtered"
                        title={`No records match "${searchTerm || statusFilter}"`}
                        description="Reset your search or status filter to view staged and delivered records."
                        actionLabel="Clear Filters"
                        onAction={() => {
                          setSearchTerm("");
                          setStatusFilter("ALL");
                        }}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : paginatedResults.length > 60 ? (
              <TableVirtuoso
                style={{ height: 520 }}
                data={paginatedResults}
                fixedHeaderContent={() => (
                  <tr className="border-b border-[var(--border-default)] bg-[var(--bg-subtle)] text-left text-xs text-[var(--text-muted)]">
                    <th scope="col" className="w-[5%] px-3 py-2.5 font-semibold">#</th>
                    <th scope="col" className="w-[18%] px-3 py-2.5 font-semibold">Source Identifier</th>
                    <th scope="col" className="w-[24%] px-3 py-2.5 font-semibold">Clinical / Demographics</th>
                    <th scope="col" className="w-[20%] px-3 py-2.5 font-semibold">Target Medplum Link</th>
                    <th scope="col" className="w-[15%] px-3 py-2.5 font-semibold">Status</th>
                    <th scope="col" className="w-[18%] px-3 py-2.5 font-semibold text-right">Actions</th>
                  </tr>
                )}
                itemContent={(idx, r) => {
                  const globalIdx = (currentPage - 1) * pageSize + idx;
                  return renderRowCells(r, globalIdx);
                }}
              />
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                  <tr className="border-b border-[var(--border-default)]">
                    <th scope="col" className="w-[5%] px-3 py-2.5 font-semibold">#</th>
                    <th scope="col" className="w-[18%] px-3 py-2.5 font-semibold">Source Identifier</th>
                    <th scope="col" className="w-[24%] px-3 py-2.5 font-semibold">Clinical / Demographics</th>
                    <th scope="col" className="w-[20%] px-3 py-2.5 font-semibold">Target Medplum Link</th>
                    <th scope="col" className="w-[15%] px-3 py-2.5 font-semibold">Status</th>
                    <th scope="col" className="w-[18%] px-3 py-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {paginatedResults.map((r, idx) => {
                    const globalIdx = (currentPage - 1) * pageSize + idx;
                    const isInvalid = r.status === "invalid" || (r.errors && r.errors.length > 0);
                    return (
                      <tr
                        key={`${r.source_id}-${globalIdx}`}
                        className={cn(
                          "hover:bg-[var(--bg-subtle)]/50",
                          isInvalid && "bg-[var(--bad-bg)]/45 border-l-4 border-l-[var(--bad)]"
                        )}
                      >
                        {renderRowCells(r, globalIdx)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </DataTableShell>
        </div>
      )}
    </div>
  );
}
