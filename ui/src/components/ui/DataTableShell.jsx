import React from "react";
import { Search, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import Button from "./Button.jsx";
import { cn } from "@/utils/cn.js";

export function DataTableShell({
  searchTerm,
  onSearchChange,
  searchPlaceholder = "Search ID or name…",
  filterOptions = [], // [{ id, label, count }]
  activeFilter,
  onFilterChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [15, 25, 50, 100],
  currentPage,
  totalPages,
  totalFiltered,
  onPageChange,
  children,
}) {
  const startRow = totalFiltered === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(totalFiltered, currentPage * pageSize);

  return (
    <div className="space-y-3">
      {/* Search + Status Filter + Page Size Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)]/70 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <form
            onSubmit={(e) => e.preventDefault()}
            className="relative flex items-center"
            role="search"
          >
            <Search
              className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="h-[32px] w-[220px] rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] pl-8 pr-7 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            {searchTerm && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => onSearchChange?.("")}
                className="absolute right-1.5 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </form>

          {/* Status Filter Chips */}
          {filterOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by status">
              {filterOptions.map((opt) => {
                const active = activeFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onFilterChange?.(opt.id)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer tabular-nums",
                      active
                        ? "bg-[var(--brand)] border-[var(--brand)] text-[var(--brand-fg)] etl-active-ring"
                        : "bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]"
                    )}
                  >
                    <span>{opt.label}</span>
                    {opt.count !== undefined && <span className="opacity-80">({opt.count})</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Row count + Page Size */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)] tabular-nums">
          <span>
            Showing {startRow}–{endRow} of {totalFiltered}
          </span>
          <label className="flex items-center gap-1.5">
            <span className="sr-only">Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
              className="h-[30px] rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 text-xs text-[var(--text-primary)]"
            >
              {pageSizeOptions.map((sz) => (
                <option key={sz} value={sz}>
                  {sz} / page
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Table Slot */}
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)]">
        {children}
      </div>

      {/* Footer Pagination (Hidden when single page, per states-page-boundary) */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-[var(--text-muted)] tabular-nums">
          <span>
            Page <strong className="text-[var(--text-primary)]">{currentPage}</strong> of{" "}
            <strong className="text-[var(--text-primary)]">{totalPages}</strong>
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={currentPage <= 1}
              onClick={() => onPageChange?.(1)}
              aria-label="First page"
            >
              <ChevronsLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={currentPage <= 1}
              onClick={() => onPageChange?.(Math.max(1, currentPage - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange?.(Math.min(totalPages, currentPage + 1))}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange?.(totalPages)}
              aria-label="Last page"
            >
              <ChevronsRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataTableShell;
