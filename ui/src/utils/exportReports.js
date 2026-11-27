/**
 * Pure report & bundle export helpers (UTF-8 BOM Excel-compatible CSV + JSON).
 */

function escapeCsvCell(val) {
  const str = val !== undefined && val !== null ? String(val) : "";
  return `"${str.replace(/"/g, '""')}"`;
}

export function buildCsvString(rows, orderedHeaders = null) {
  if (!rows || rows.length === 0) return "";
  const headerSet = new Set(orderedHeaders || []);
  rows.forEach((row) => Object.keys(row).forEach((k) => headerSet.add(k)));
  const headers = Array.from(headerSet);

  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(",")),
  ];
  return "\uFEFF" + lines.join("\n");
}

function triggerBrowserDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsvFile(rows, filename, orderedHeaders = null) {
  const content = buildCsvString(rows, orderedHeaders);
  if (!content) return false;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  triggerBrowserDownload(blob, filename);
  return true;
}

export function downloadJsonFile(payload, filename) {
  if (!payload) return false;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8;",
  });
  triggerBrowserDownload(blob, filename);
  return true;
}

export function exportUploadBatchReport({
  results = [],
  allRows = [],
  type = "full",
  datasetName = "upload",
  targetResource = "Patient",
}) {
  if (!results.length) {
    return { ok: false, reason: "No records available to export." };
  }

  let targetResults = results;
  let filenameSuffix = "Full_Audit_Report.csv";

  if (type === "quarantine") {
    targetResults = results.filter((r) => r.status === "invalid" || r.status === "failed");
    filenameSuffix = "Quarantine_Exceptions.csv";
    if (targetResults.length === 0) {
      return { ok: false, reason: "No quarantined or failed records in this batch." };
    }
  } else if (type === "manifest") {
    targetResults = results.filter((r) => r.status === "delivered");
    filenameSuffix = "Delivery_Manifest.csv";
    if (targetResults.length === 0) {
      return { ok: false, reason: "No delivered records yet. Deliver records first to export the manifest." };
    }
  }

  let rows = [];
  if (type === "quarantine") {
    rows = targetResults.map((r, i) => {
      const origIdx = results.indexOf(r);
      const srcRecord = r.source_record || allRows?.[origIdx] || {};
      const errs = r.errors || [];
      return {
        "#": i + 1,
        "Original Row": origIdx + 1,
        "Error Classification":
          r.mapping_details?.error_category ||
          (r.status === "failed" ? "API Delivery Failure" : "FHIR R4 Schema Violation"),
        "Source Identifier": r.source_id,
        "Violations / Errors": errs.join(" | "),
        "Remediation Guidance": errs.some((e) => e.includes("deceasedDateTime"))
          ? "Format datetime to ISO 8601 or YYYY-MM-DD or use AI Auto-Heal"
          : errs.some((e) => e.includes("transform"))
          ? "Auto-heal mapping transforms or edit source record"
          : "Review field values against FHIR R4 schema constraints or use Edit Record",
        ...srcRecord,
      };
    });
  } else if (type === "manifest") {
    rows = targetResults.map((r, i) => {
      const origIdx = results.indexOf(r);
      const srcRecord = r.source_record || allRows?.[origIdx] || {};
      const action = r.mapping_details?.delivery_action || "created";
      return {
        "#": i + 1,
        "Medplum Resource ID": r.target_id || "—",
        "Medplum Portal URL": r.target_id ? `http://localhost:3000/${targetResource}/${r.target_id}` : "—",
        "Delivery Action": action === "created" ? "Created (New Resource)" : "Updated (Idempotent Match)",
        "Source Identifier": r.source_id,
        "Patient Name": r.patient_summary?.title || "—",
        "Demographics": r.patient_summary?.subtitle || "—",
        "Scoped Identifier": r.mapping_details?.idempotent_identifier || "—",
        "Delivery Timestamp": new Date().toISOString(),
        ...srcRecord,
      };
    });
  } else {
    rows = targetResults.map((r, i) => {
      const origIdx = results.indexOf(r);
      const srcRecord = r.source_record || allRows?.[origIdx] || {};
      const action = r.mapping_details?.delivery_action || (r.status === "delivered" ? "delivered" : r.status);
      return {
        "#": i + 1,
        "ETL Status": r.status === "dry_run" ? "validated" : r.status,
        "Delivery Scenario": action,
        "Target Medplum ID": r.target_id || "—",
        "Medplum URL": r.target_id ? `http://localhost:3000/${targetResource}/${r.target_id}` : "—",
        "Scoped Identifier": r.mapping_details?.idempotent_identifier || "—",
        ...srcRecord,
        "ETL Errors": (r.errors || []).join(" | "),
      };
    });
  }

  const filename = `${datasetName}_${filenameSuffix}`;
  downloadCsvFile(rows, filename);
  return { ok: true, filename, count: rows.length };
}

export function exportPipelineBatchCsv({ results = [], resourceType = "Patient", offset = 0 }) {
  if (!results.length) {
    return { ok: false, reason: "No pipeline results to export." };
  }
  const rows = results.map((r, i) => ({
    "#": offset + i + 1,
    "Source Resource": resourceType,
    "Source ID": r.source_id,
    "Title / Patient Name": r.patient_summary?.title || "—",
    "Primary Metric / Code": r.patient_summary?.primary_value || r.patient_summary?.code || "—",
    "Secondary / Date": r.patient_summary?.secondary_value || r.patient_summary?.subtitle || "—",
    "Status": r.status === "dry_run" ? "validated" : r.status,
    "Delivery Action": r.mapping_details?.delivery_action || "—",
    "Target Medplum ID": r.target_id || "—",
    "Medplum URL": r.target_id ? `http://localhost:3000/${resourceType}/${r.target_id}` : "—",
    "Idempotent Identifier": r.mapping_details?.idempotent_identifier || `urn:source:hapi|${r.source_id}`,
    "Subject Link": r.mapping_details?.target_subject_reference || r.patient_summary?.subject_reference || "—",
    "Errors": (r.errors || []).join(" | "),
  }));
  const filename = `HAPI_to_Medplum_${resourceType}_Offset${offset}_Audit.csv`;
  downloadCsvFile(rows, filename);
  return { ok: true, filename, count: rows.length };
}
