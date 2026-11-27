import React, { useState, useMemo } from "react";
import { Search, X, ChevronDown, ChevronUp, CheckCircle2, Sparkles, Link2, Eraser, Ban, Minus } from "lucide-react";
import Badge from "@/components/ui/Badge.jsx";
import Button from "@/components/ui/Button.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import { cn } from "@/utils/cn.js";

const STATUS_BADGES = {
  preserved: { label: "Preserved", tone: "ok", icon: CheckCircle2 },
  transformed: { label: "Transformed", tone: "brand", icon: Sparkles },
  scoped_identity: { label: "Scoped ID", tone: "info", icon: Link2 },
  remapped_reference: { label: "Remapped Ref", tone: "warn", icon: Link2 },
  sanitized: { label: "Sanitized", tone: "neutral", icon: Eraser },
  generated: { label: "Generated", tone: "ai", icon: Sparkles },
  dropped: { label: "Omitted", tone: "bad", icon: Ban },
  empty: { label: "Empty", tone: "neutral", icon: Minus },
};

export default function ReconciliationTable({
  table = [],
  sourceTitle = "Source Payload",
  targetTitle = "Destination Stored",
}) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [expandedFields, setExpandedFields] = useState({});

  const toggleExpand = (key) => {
    setExpandedFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const statusCounts = useMemo(() => {
    const counts = { all: table.length };
    table.forEach((row) => {
      counts[row.status] = (counts[row.status] || 0) + 1;
    });
    return counts;
  }, [table]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return table.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (!q) return true;
      return (
        (row.field || "").toLowerCase().includes(q) ||
        (row.label || "").toLowerCase().includes(q) ||
        (row.source_display || "").toLowerCase().includes(q) ||
        (row.target_display || "").toLowerCase().includes(q) ||
        (row.rule || "").toLowerCase().includes(q)
      );
    });
  }, [table, filter, query]);

  if (!table || table.length === 0) {
    return (
      <EmptyState
        variant="first-run"
        title="No field reconciliation data available"
        description="Run transformation or validation on this record to inspect source-to-target field lineage."
      />
    );
  }

  const filterOrder = [
    "all",
    "preserved",
    "transformed",
    "scoped_identity",
    "remapped_reference",
    "sanitized",
    "generated",
    "dropped",
    "empty",
  ];

  return (
    <div className="space-y-3">
      {/* Search & Status Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={(e) => e.preventDefault()} className="relative flex items-center" role="search">
          <Search
            className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search extracted fields, values, or rules"
            placeholder="Search fields, values, or rules…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-[32px] w-[260px] rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] pl-8 pr-7 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear field search"
              onClick={() => setQuery("")}
              className="absolute right-1.5 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter fields by disposition">
          {filterOrder.map((key) => {
            const count = statusCounts[key] || 0;
            if (key !== "all" && count === 0) return null;
            const active = filter === key;
            const label = key === "all" ? "All Fields" : STATUS_BADGES[key]?.label || key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(key)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors cursor-pointer",
                  active
                    ? "bg-[var(--brand)] border-[var(--brand)] text-[var(--brand-fg)] etl-active-ring"
                    : "bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                )}
              >
                <span>{label}</span>
                <span className="opacity-80">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table Frame */}
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)]">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--bg-subtle)] text-[var(--text-muted)]">
            <tr className="border-b border-[var(--border-default)]">
              <th scope="col" className="w-[22%] px-3 py-2.5 font-semibold">Attribute / Canonical Field</th>
              <th scope="col" className="w-[25%] px-3 py-2.5 font-semibold">{sourceTitle}</th>
              <th scope="col" className="w-[22%] px-3 py-2.5 font-semibold">Transformation Rule</th>
              <th scope="col" className="w-[21%] px-3 py-2.5 font-semibold">{targetTitle}</th>
              <th scope="col" className="w-[10%] px-3 py-2.5 font-semibold text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-default)]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4">
                  <EmptyState
                    variant="filtered"
                    title={`No fields match "${query || filter}"`}
                    description="Adjust your search term or reset the disposition filter to inspect all extracted attributes."
                    actionLabel="Clear Filters"
                    onAction={() => {
                      setFilter("all");
                      setQuery("");
                    }}
                  />
                </td>
              </tr>
            ) : (
              filtered.map((row, idx) => {
                const badge = STATUS_BADGES[row.status] || {
                  label: row.status,
                  tone: "brand",
                  icon: Sparkles,
                };
                const srcKey = `src_${row.field}_${idx}`;
                const tgtKey = `tgt_${row.field}_${idx}`;
                const srcOpen = Boolean(expandedFields[srcKey]);
                const tgtOpen = Boolean(expandedFields[tgtKey]);

                return (
                  <tr key={`${row.field}-${idx}`} className="align-top hover:bg-[var(--bg-subtle)]/50">
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {row.label || row.field}
                      </div>
                      <code className="text-xs text-[var(--text-muted)]">{row.field}</code>
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="max-w-[280px] rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-code)] px-2.5 py-1.5 break-words text-[var(--text-primary)]">
                        <div>{row.source_display || "—"}</div>
                        {typeof row.source_raw === "object" && row.source_raw !== null && (
                          <div className="mt-1">
                            <Button
                              size="sm"
                              variant="link"
                              aria-expanded={srcOpen}
                              aria-controls={`raw-${srcKey}`}
                              onClick={() => toggleExpand(srcKey)}
                            >
                              {srcOpen ? (
                                <>
                                  <ChevronUp className="h-3 w-3" aria-hidden="true" />
                                  Hide Raw
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-3 w-3" aria-hidden="true" />
                                  Raw JSON
                                </>
                              )}
                            </Button>
                            {srcOpen && (
                              <pre
                                id={`raw-${srcKey}`}
                                className="mt-1.5 max-h-[140px] rounded border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 text-xs text-[var(--text-primary)]"
                              >
                                {JSON.stringify(row.source_raw, null, 2)}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-[var(--text-secondary)] leading-relaxed">
                      {row.rule}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="max-w-[280px] rounded-[var(--radius-sm)] border border-[var(--ok-border)] bg-[var(--ok-bg)]/50 px-2.5 py-1.5 break-words text-[var(--text-primary)]">
                        <div>{row.target_display || "—"}</div>
                        {typeof row.target_raw === "object" && row.target_raw !== null && (
                          <div className="mt-1">
                            <Button
                              size="sm"
                              variant="link"
                              aria-expanded={tgtOpen}
                              aria-controls={`raw-${tgtKey}`}
                              onClick={() => toggleExpand(tgtKey)}
                            >
                              {tgtOpen ? (
                                <>
                                  <ChevronUp className="h-3 w-3" aria-hidden="true" />
                                  Hide Raw
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-3 w-3" aria-hidden="true" />
                                  Raw JSON
                                </>
                              )}
                            </Button>
                            {tgtOpen && (
                              <pre
                                id={`raw-${tgtKey}`}
                                className="mt-1.5 max-h-[140px] rounded border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 text-xs text-[var(--text-primary)]"
                              >
                                {JSON.stringify(row.target_raw, null, 2)}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-right">
                      <Badge tone={badge.tone} icon={badge.icon}>
                        {badge.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
