import React, { useState } from "react";

export default function AddRecordModal({ isOpen, headers = [], onClose, onSave, error }) {
  const [formData, setFormData] = useState(() => {
    const init = {};
    headers.forEach((h) => {
      init[h] = "";
    });
    return init;
  });

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: "750px" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: "16px" }}>➕ Add New Record to Batch</h3>
            <span className="sub-meta">Enter clinical or demographic attributes and validate in real-time</span>
          </div>
          <button className="secondary sm" onClick={onClose}>✕ Close</button>
        </div>

        {error && (
          <div className="error" style={{ margin: "14px 20px 0" }}>
            <strong>Validation Violation:</strong> {error}
          </div>
        )}

        <div className="modal-body" style={{ maxHeight: "55vh", overflowY: "auto", padding: "16px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {headers.map((col) => (
              <div key={col}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px" }}>
                  {col}
                </label>
                <input
                  type="text"
                  value={formData[col] ?? ""}
                  onChange={(e) => setFormData({ ...formData, [col]: e.target.value })}
                  style={{ width: "100%", padding: "7px 10px", fontSize: "12px", borderRadius: "6px" }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="modal-header" style={{ borderTop: "1px solid var(--card-border)", justifyContent: "flex-end", gap: "10px" }}>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => onSave(formData)}>
            ➕ Add & Validate Record
          </button>
        </div>
      </div>
    </div>
  );
}

