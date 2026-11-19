import { useState, useMemo } from "react";

const STATUS_BADGES = {
  preserved: { label: "Preserved", cls: "badge-preserved" },
  transformed: { label: "Transformed", cls: "badge-transformed" },
  scoped_identity: { label: "Scoped ID", cls: "badge-scoped" },
  remapped_reference: { label: "Remapped Ref", cls: "badge-remapped" },
  sanitized: { label: "Sanitized", cls: "badge-sanitized" },
  generated: { label: "Generated", cls: "badge-generated" },
  dropped: { label: "Omitted", cls: "badge-dropped" },
  empty: { label: "Empty", cls: "badge-sanitized" },
};

export default function ReconciliationTable({
  table = [],
  sourceTitle = "Source Payload",
  targetTitle = "Destination Stored",
}) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [expandedFields, setExpandedFields] = useState({});

  const toggleExpand = (f) => {
    setExpandedFields((prev) => ({ ...prev, [f]: !prev[f] }));
  };

  const statusCounts = useMemo(() => {
    const counts = { all: table.length };
    table.forEach((row) => {
      counts[row.status] = (counts[row.status] || 0) + 1;
    });
    return counts;
  }, [table]);

  const filtered = useMemo(() => {
    return table.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      const inField = (row.field || "").toLowerCase().includes(q);
      const inLabel = (row.label || "").toLowerCase().includes(q);
      const inSrc = (row.source_display || "").toLowerCase().includes(q);
      const inTgt = (row.target_display || "").toLowerCase().includes(q);
      const inRule = (row.rule || "").toLowerCase().includes(q);
      return inField || inLabel || inSrc || inTgt || inRule;
    });
  }, [table, filter, query]);

  if (!table || table.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
        No field reconciliation data available.
      </div>
    );
  }

  return (
    <div className="recon-container">
      {/* Search and Status Filters */}
      <div className="recon-filter-bar">
        <input
          type="text"
          className="recon-search-input"
          placeholder="🔍 Search extracted fields, values, or rules..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="recon-status-filters">
          <button
            className={`filter-chip ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All Fields ({statusCounts.all || 0})
          </button>
          {statusCounts.preserved > 0 && (
            <button
              className={`filter-chip ${filter === "preserved" ? "active" : ""}`}
              onClick={() => setFilter("preserved")}
            >
              Preserved ({statusCounts.preserved})
            </button>
          )}
          {statusCounts.transformed > 0 && (
            <button
              className={`filter-chip ${filter === "transformed" ? "active" : ""}`}
              onClick={() => setFilter("transformed")}
            >
              Transformed ({statusCounts.transformed})
            </button>
          )}
          {statusCounts.scoped_identity > 0 && (
            <button
              className={`filter-chip ${filter === "scoped_identity" ? "active" : ""}`}
              onClick={() => setFilter("scoped_identity")}
            >
              Scoped ID ({statusCounts.scoped_identity})
            </button>
          )}
          {statusCounts.remapped_reference > 0 && (
            <button
              className={`filter-chip ${filter === "remapped_reference" ? "active" : ""}`}
              onClick={() => setFilter("remapped_reference")}
            >
              Remapped Ref ({statusCounts.remapped_reference})
            </button>
          )}
          {statusCounts.sanitized > 0 && (
            <button
              className={`filter-chip ${filter === "sanitized" ? "active" : ""}`}
              onClick={() => setFilter("sanitized")}
            >
              Sanitized ({statusCounts.sanitized})
            </button>
          )}
          {statusCounts.generated > 0 && (
            <button
              className={`filter-chip ${filter === "generated" ? "active" : ""}`}
              onClick={() => setFilter("generated")}
            >
              Generated ({statusCounts.generated})
            </button>
          )}
          {statusCounts.dropped > 0 && (
            <button
              className={`filter-chip ${filter === "dropped" ? "active" : ""}`}
              onClick={() => setFilter("dropped")}
            >
              Omitted ({statusCounts.dropped})
            </button>
          )}
          {statusCounts.empty > 0 && (
            <button
              className={`filter-chip ${filter === "empty" ? "active" : ""}`}
              onClick={() => setFilter("empty")}
            >
              Empty ({statusCounts.empty})
            </button>
          )}
        </div>
      </div>

      {/* Dynamic Extraction Table */}
      <table className="recon-table">
        <thead>
          <tr>
            <th style={{ width: "22%" }}>Attribute / Canonical Field</th>
            <th style={{ width: "26%" }}>{sourceTitle} (Extracted)</th>
            <th style={{ width: "22%" }}>Transformation / Derivation Rule</th>
            <th style={{ width: "20%" }}>{targetTitle} (Perspective)</th>
            <th style={{ width: "10%", textAlign: "right" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row, idx) => {
            const badge = STATUS_BADGES[row.status] || {
              label: row.status,
              cls: "badge-transformed",
            };
            const isExpanded = !!expandedFields[row.field];

            return (
              <tr key={idx}>
                <td>
                  <div className="field-cell">
                    <span className="field-name">{row.label || row.field}</span>
                    <span className="field-key"><code>{row.field}</code></span>
                  </div>
                </td>

                <td>
                  <div className="val-box">
                    <div>{row.source_display || "—"}</div>
                    {typeof row.source_raw === "object" && row.source_raw !== null && (
                      <div>
                        <button
                          className="link"
                          style={{ fontSize: "11px", marginTop: "4px" }}
                          onClick={() => toggleExpand(`src_${row.field}_${idx}`)}
                        >
                          {expandedFields[`src_${row.field}_${idx}`] ? "▲ Hide Raw" : "▼ Raw JSON"}
                        </button>
                        {expandedFields[`src_${row.field}_${idx}`] && (
                          <pre style={{ fontSize: "11px", margin: "4px 0 0", maxHeight: "150px" }}>
                            {JSON.stringify(row.source_raw, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                </td>

                <td>
                  <div className="rule-box">
                    <span>{row.rule}</span>
                  </div>
                </td>

                <td>
                  <div className="val-box stored">
                    <div>{row.target_display || "—"}</div>
                    {typeof row.target_raw === "object" && row.target_raw !== null && (
                      <div>
                        <button
                          className="link"
                          style={{ fontSize: "11px", marginTop: "4px" }}
                          onClick={() => toggleExpand(`tgt_${row.field}_${idx}`)}
                        >
                          {expandedFields[`tgt_${row.field}_${idx}`] ? "▲ Hide Raw" : "▼ Raw JSON"}
                        </button>
                        {expandedFields[`tgt_${row.field}_${idx}`] && (
                          <pre style={{ fontSize: "11px", margin: "4px 0 0", maxHeight: "150px" }}>
                            {JSON.stringify(row.target_raw, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                </td>

                <td style={{ textAlign: "right" }}>
                  <span className={`badge-status ${badge.cls}`}>{badge.label}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "13px" }}>
          No fields matched the current filter/search.
        </div>
      )}
    </div>
  );
}

