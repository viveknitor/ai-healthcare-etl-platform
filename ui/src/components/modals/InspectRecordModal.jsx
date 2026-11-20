import React, { useState } from "react";
import ReconciliationTable from "../ReconciliationTable.jsx";

export default function InspectRecordModal({ activeRecord, targetResource, onClose, copyPayload, copiedKey }) {
  const [modalTab, setModalTab] = useState("recon"); // "recon" | "raw"

  if (!activeRecord) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: "16px" }}>
              🔍 Record Inspector: <code>{activeRecord.source_id}</code>
            </h3>
            <span className="sub-meta">FHIR R4 Resource Lineage & Dynamic Reconciliation</span>
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
              table={activeRecord.reconciliation_table}
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

