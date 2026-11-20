import React from "react";

export default function DeliveryConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  onReviewQuarantine,
  validCount,
  invalidCount,
  targetResource = "Patient",
  datasetName = "Dataset",
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: "620px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "22px" }}>🚀</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px" }}>
                Confirm Medplum Ingestion &amp; Delivery
              </h3>
              <span className="sub-meta">
                HL7 FHIR R4 Destination: <code>{targetResource}</code> • Batch: {datasetName}
              </span>
            </div>
          </div>
          <button className="secondary sm" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: "20px" }}>
          {invalidCount > 0 ? (
            <div>
              <div
                style={{
                  background: "rgba(245, 158, 11, 0.12)",
                  border: "1px solid rgba(245, 158, 11, 0.4)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px 16px",
                  marginBottom: "16px",
                }}
              >
                <div style={{ fontWeight: 700, color: "#fcd34d", fontSize: "14px", marginBottom: "4px" }}>
                  ⚠️ Quality Gate Safety Notice
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  <strong>{validCount} records</strong> passed pre-flight validation and are ready for Medplum delivery.
                  <br />
                  <strong>{invalidCount} record(s)</strong> have source data violations and <strong>will NOT be submitted</strong> to Medplum to protect clinical repository integrity.
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div
                  style={{
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    borderRadius: "8px",
                    padding: "14px",
                  }}
                >
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#34d399", textTransform: "uppercase" }}>
                    ✓ Delivering to Medplum
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: "#34d399", margin: "4px 0" }}>
                    {validCount}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Conforms to FHIR R4 schema constraints. Will be created or updated idempotently.
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "8px",
                    padding: "14px",
                  }}
                >
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#f87171", textTransform: "uppercase" }}>
                    🚨 Quarantining (No Delivery)
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: "#f87171", margin: "4px 0" }}>
                    {invalidCount}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Isolated in review ledger. Will not corrupt Medplum. Can be fixed via 1-click Auto-Fix.
                  </div>
                </div>
              </div>

              <div style={{ fontSize: "12px", color: "var(--muted)", background: "rgba(0,0,0,0.25)", padding: "10px 14px", borderRadius: "6px" }}>
                💡 <strong>Clinical Tip:</strong> You can proceed to deliver the clean records now, or click &ldquo;Review &amp; Auto-Fix&rdquo; below to correct date/field violations in 1 click before delivering.
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: "36px", marginBottom: "8px" }}>✅</div>
              <h4 style={{ margin: "0 0 6px", fontSize: "16px" }}>100% Quality Gate Cleared</h4>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
                All <strong>{validCount} records</strong> conform to official HL7 FHIR R4 schema constraints.
                Zero violations detected. Ready for immediate live delivery to Medplum.
              </p>
            </div>
          )}
        </div>

        <div
          className="modal-header"
          style={{
            borderTop: "1px solid var(--card-border)",
            justifyContent: "space-between",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {invalidCount > 0 && onReviewQuarantine && (
              <button
                className="secondary"
                onClick={onReviewQuarantine}
                style={{
                  color: "#f59e0b",
                  borderColor: "rgba(245, 158, 11, 0.4)",
                  background: "rgba(245, 158, 11, 0.1)",
                }}
              >
                ✏️ Review &amp; Auto-Fix ({invalidCount})
              </button>
            )}

            <button
              className="primary"
              onClick={onConfirm}
              style={{
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                borderColor: "rgba(16, 185, 129, 0.5)",
                boxShadow: "0 4px 14px rgba(16, 185, 129, 0.4)",
              }}
            >
              {invalidCount > 0
                ? `🚀 Deliver ${validCount} Validated (Quarantine ${invalidCount})`
                : `🚀 Deliver All ${validCount} to Medplum`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
