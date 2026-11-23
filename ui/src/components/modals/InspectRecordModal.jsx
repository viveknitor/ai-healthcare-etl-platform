import React, { useState, useMemo } from "react";
import ReconciliationTable from "../ReconciliationTable.jsx";

export default function InspectRecordModal({
  activeRecord,
  targetResource = "Patient",
  mapping,
  onClose,
  copyPayload,
  copiedKey,
}) {
  const [modalTab, setModalTab] = useState("recon"); // "recon" | "raw"

  // Dynamically ensure reconciliation table is always available even for quarantined records
  const reconciliationData = useMemo(() => {
    if (activeRecord?.reconciliation_table && activeRecord.reconciliation_table.length > 0) {
      return activeRecord.reconciliation_table;
    }
    const src = activeRecord?.source_record || {};
    const tgt = activeRecord?.target_record || {};
    const rules = mapping?.rules || [];
    if (!rules.length && !Object.keys(src).length) return [];

    const matrix = [
      {
        field: "resourceType",
        label: "Resource Type / Domain",
        source_raw: null,
        source_display: "—",
        rule: `Defaulted FHIR resource type for ${targetResource || "Patient"}`,
        status: "generated",
        target_raw: targetResource || "Patient",
        target_display: targetResource || "Patient",
      },
    ];

    const mappedSources = new Set();
    rules.forEach((rule) => {
      mappedSources.add(rule.source);
      const srcVal = src[rule.source];
      let tgtVal = undefined;

      if (rule.target) {
        const parts = rule.target.split(".");
        let cur = tgt;
        for (const p of parts) {
          if (!cur) break;
          const arrayMatch = p.match(/^([^\[]+)\[(\d+)\]$/);
          if (arrayMatch) {
            cur = cur[arrayMatch[1]]?.[parseInt(arrayMatch[2], 10)];
          } else {
            cur = cur[p];
          }
        }
        tgtVal = cur;
      }

      if (tgtVal === undefined && rule.target?.includes("extension")) {
        const extUrl = `urn:source:extension:${rule.source}`;
        const found = (tgt.extension || []).find((e) => e?.url === extUrl);
        if (found) {
          const valKey = Object.keys(found).find((k) => k.startsWith("value"));
          if (valKey) tgtVal = found[valKey];
        }
      }

      const srcDisp =
        srcVal !== undefined && srcVal !== null && srcVal !== "" ? String(srcVal) : "—";
      const tgtDisp =
        tgtVal !== undefined && tgtVal !== null
          ? typeof tgtVal === "object"
            ? JSON.stringify(tgtVal)
            : String(tgtVal)
          : "—";

      let status = "dropped";
      let ruleDesc = `Unmapped in destination payload (${rule.source} -> ${rule.target})`;
      if (srcVal === undefined || srcVal === null || srcVal === "") {
        status = "empty";
        ruleDesc = `Source field empty in record (${rule.source} -> ${rule.target})`;
      } else if (tgtVal !== undefined) {
        if (String(srcVal).trim() === String(tgtVal).trim()) {
          status = "preserved";
          ruleDesc = `Direct mapped: ${rule.source} -> ${rule.target}`;
        } else {
          status = "transformed";
          ruleDesc = `Transformed: ${rule.source} (${srcDisp}) -> ${rule.target} (${tgtDisp})`;
        }
      }

      matrix.push({
        field: rule.source,
        label: `${rule.source} (${rule.source})`,
        source_raw: srcVal,
        source_display: srcDisp,
        rule: ruleDesc,
        status: status,
        target_raw: tgtVal,
        target_display: tgtDisp,
      });
    });

    // Capture unmapped raw columns
    Object.keys(src).forEach((col) => {
      if (!mappedSources.has(col)) {
        matrix.push({
          field: col,
          label: `${col} (${col})`,
          source_raw: src[col],
          source_display: String(src[col] || "—"),
          rule: `Unmapped source column (omitted from ${targetResource || "Patient"} FHIR payload)`,
          status: "dropped",
          target_raw: null,
          target_display: "—",
        });
      }
    });

    return matrix;
  }, [activeRecord, mapping, targetResource]);

  if (!activeRecord) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: "16px" }}>
              🔍 Record Inspector: <code>{activeRecord.source_id}</code>
            </h3>
            <span className="sub-meta">FHIR R4 Resource Lineage &amp; Dynamic Reconciliation</span>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {activeRecord.target_id && (
              <a
                href={`http://localhost:3000/${targetResource}/${activeRecord.target_id}`}
                target="_blank"
                rel="noreferrer"
                className="target-link"
                style={{ fontSize: "12px", padding: "4px 10px" }}
              >
                Open in Medplum Portal ↗
              </a>
            )}
            <button className="secondary sm" onClick={onClose}>
              ✕ Close
            </button>
          </div>
        </div>

        <div className="modal-tabs">
          <button
            className={`modal-tab-btn ${modalTab === "recon" ? "active" : ""}`}
            onClick={() => setModalTab("recon")}
          >
            <span>🔄</span> Dynamic Reconciliation Matrix
          </button>
          <button
            className={`modal-tab-btn ${modalTab === "raw" ? "active" : ""}`}
            onClick={() => setModalTab("raw")}
          >
            <span>📄</span> Raw JSON Payloads
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: "65vh", overflowY: "auto" }}>
          {modalTab === "recon" && (
            <ReconciliationTable
              table={reconciliationData}
              sourceTitle="Source Uploaded Record"
              targetTitle={`Target ${targetResource} Stored`}
            />
          )}

          {modalTab === "raw" && (
            <div className="grid2">
              <div className="pane">
                <div className="row between" style={{ margin: "0 0 8px" }}>
                  <h4 style={{ margin: 0 }}>Source Row</h4>
                  <button className="secondary sm" onClick={() => copyPayload("src", activeRecord.source_record)}>
                    {copiedKey === "src" ? "✓ Copied" : "Copy Source"}
                  </button>
                </div>
                <pre>{JSON.stringify(activeRecord.source_record, null, 2)}</pre>
              </div>
              <div className="pane">
                <div className="row between" style={{ margin: "0 0 8px" }}>
                  <h4 style={{ margin: 0 }}>Target Medplum Resource</h4>
                  <button className="secondary sm" onClick={() => copyPayload("tgt", activeRecord.target_record)}>
                    {copiedKey === "tgt" ? "✓ Copied" : "Copy Target"}
                  </button>
                </div>
                <pre>{JSON.stringify(activeRecord.target_record, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
