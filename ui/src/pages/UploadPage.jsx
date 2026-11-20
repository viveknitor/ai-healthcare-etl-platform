import { useState } from "react";
import { api } from "../api.js";
import AgentWorkflowVisualizer from "../components/AgentWorkflowVisualizer.jsx";
import StepperHeader from "../components/wizard/StepperHeader.jsx";
import Step1SourceIntake from "../components/wizard/Step1SourceIntake.jsx";
import Step2MappingContract from "../components/wizard/Step2MappingContract.jsx";
import Step3QualityGate from "../components/wizard/Step3QualityGate.jsx";
import Step4ReconciliationHub from "../components/wizard/Step4ReconciliationHub.jsx";
import EditRecordModal from "../components/modals/EditRecordModal.jsx";
import InspectRecordModal from "../components/modals/InspectRecordModal.jsx";
import AddRecordModal from "../components/modals/AddRecordModal.jsx";

const SAMPLE_PLANDATA_ROWS = [
  {
    memid: "MEM-100231",
    entityid: "ENT-9940",
    status: "ACTIVE",
    sex: "M",
    fullname: "Quincy Kowalski",
    ssn: "[REDACTED_SOCIAL_SECURITY_NUMBER_1]",
    dob: "1968-05-23",
    deathdate: "",
    marital: "M",
    primarylanguage: "en",
    multiplebirth: "0",
    headofhouse: "MEM-100231",
    guardian: "MEM-100231",
    ExternalId: "EXT-8812",
    secondaryid: "SEC-101",
    enterpriseid: "EMP-900",
    obs_ethnicid: "HISPANIC",
    isvip: "0",
  },
  {
    memid: "MEM-100232",
    entityid: "ENT-9940",
    status: "ACTIVE",
    sex: "F",
    fullname: "Elena Rostova",
    ssn: "[REDACTED_SOCIAL_SECURITY_NUMBER_2]",
    dob: "1975-11-14",
    deathdate: "",
    marital: "M",
    primarylanguage: "es",
    multiplebirth: "0",
    headofhouse: "MEM-100231",
    guardian: "MEM-100231",
    ExternalId: "EXT-8813",
    secondaryid: "SEC-102",
    enterpriseid: "EMP-901",
    obs_ethnicid: "WHITE",
    isvip: "0",
  },
  {
    memid: "MEM-100233",
    entityid: "ENT-9941",
    status: "TERM",
    sex: "M",
    fullname: "Marcus Vance",
    ssn: "[REDACTED_SOCIAL_SECURITY_NUMBER_3]",
    dob: "1982-03-30",
    deathdate: "",
    marital: "S",
    primarylanguage: "en",
    multiplebirth: "0",
    headofhouse: "MEM-100233",
    guardian: "MEM-100233",
    ExternalId: "EXT-8814",
    secondaryid: "SEC-103",
    enterpriseid: "EMP-902",
    obs_ethnicid: "BLACK",
    isvip: "1",
  },
];

export default function UploadPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [fileData, setFileData] = useState(null);
  const [targetResource, setTargetResource] = useState("Patient");
  const [datasetName, setDatasetName] = useState("PlanData-Member");
  const [mapping, setMapping] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [activeRecord, setActiveRecord] = useState(null);
  const [copiedKey, setCopiedKey] = useState("");
  const [isValidated, setIsValidated] = useState(false);
  const [isDelivered, setIsDelivered] = useState(false);
  const [llmMetrics, setLlmMetrics] = useState(null);
  const [healedChanges, setHealedChanges] = useState([]);
  const [healingTrack, setHealingTrack] = useState({
    active: false,
    step: 0,
    errorsTotal: 0,
    rulesHealed: 0,
    model: "",
    costFormatted: "",
    latencyMs: 0,
    changes: [],
  });

  // Table pagination and filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Live streaming progress
  const [streamProgress, setStreamProgress] = useState(null);

  // Modals state
  const [editingRow, setEditingRow] = useState(null);
  const [editingError, setEditingError] = useState("");
  const [isAddingRecord, setIsAddingRecord] = useState(false);
  const [addRecordError, setAddRecordError] = useState("");

  // Determine maximum unlocked step
  let maxUnlockedStep = 1;
  if (fileData) maxUnlockedStep = 2;
  if (mapping) maxUnlockedStep = 3;
  if (report || isValidated) maxUnlockedStep = 4;

  // 1. File Upload Handler
  const handleFileUpload = async (file) => {
    if (!file) return;
    setBusy("upload");
    setError("");
    setReport(null);
    setIsValidated(false);
    setIsDelivered(false);
    setHealedChanges([]);
    try {
      const res = await api.uploadFile(file);
      setFileData(res);
      setDatasetName(file.name.replace(/\.[^/.]+$/, ""));
      setCurrentStep(2);
      await synthesizeMapping(res);
    } catch (e) {
      setError(`Failed to parse file: ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  // 2. Load Sample PlanData Handler
  const loadSamplePlanData = async () => {
    setBusy("upload");
    setError("");
    setReport(null);
    setIsValidated(false);
    setIsDelivered(false);
    setHealedChanges([]);
    try {
      const syntheticFileData = {
        filename: "PlanData_Members_Sample.csv",
        total_rows: SAMPLE_PLANDATA_ROWS.length,
        headers: Object.keys(SAMPLE_PLANDATA_ROWS[0]),
        sample_rows: SAMPLE_PLANDATA_ROWS,
        all_rows: SAMPLE_PLANDATA_ROWS,
      };
      setFileData(syntheticFileData);
      setDatasetName("PlanData-Member");
      setCurrentStep(2);
      await synthesizeMapping(syntheticFileData);
    } catch (e) {
      setError(`Failed to load sample: ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  // 3. AI Mapping Synthesis
  const synthesizeMapping = async (data = fileData) => {
    if (!data?.sample_rows?.[0]) return;
    setBusy("suggest");
    setError("");
    try {
      const m = await api.suggestMapping(data.sample_rows[0], targetResource);
      m.status = "approved";
      setMapping(m);
      if (m.metadata?.llm_metrics) {
        setLlmMetrics(m.metadata.llm_metrics);
      }
    } catch (e) {
      setError(`AI synthesis failed: ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  // 4. Contract Approval
  const approveMapping = async () => {
    if (!mapping) return;
    const approved = { ...mapping, status: "approved" };
    setMapping(approved);
    setCurrentStep(3);
  };

  // 5. Ingestion Engine (Dry-Run vs Delivery)
  const runIngestion = async (dryRun = false, activeMapping = mapping) => {
    if (!fileData?.all_rows || !activeMapping) return;
    setBusy(dryRun ? "validate" : "ingest");
    setError("");
    setCurrentPage(1);

    const rowsToProcess = fileData.all_rows;
    const initialCounts = { delivered: 0, dry_run: 0, invalid: 0, failed: 0 };
    const tempResults = [];
    const startTime = Date.now();

    setStreamProgress({
      current: 0,
      total: rowsToProcess.length,
      percent: 0,
      recordsPerSec: 0,
      isComplete: false,
    });

    try {
      await api.executeUploadIngestionStream({
        rows: rowsToProcess,
        mapping: activeMapping,
        dry_run: dryRun,
        dataset_name: datasetName,
        onRecord: (event) => {
          tempResults.push(event.result);
          const elapsedSec = (Date.now() - startTime) / 1000 || 0.1;
          const recPerSec = Math.round(event.index / elapsedSec);
          setStreamProgress({
            current: event.index,
            total: event.total,
            percent: Math.round((event.index / event.total) * 100),
            recordsPerSec: recPerSec,
            isComplete: false,
          });
          setReport({
            summary: { total: event.total, counts: event.current_counts },
            results: [...tempResults],
          });
        },
        onComplete: (event) => {
          const finalReport = {
            summary: event.summary,
            results: tempResults,
          };
          setReport(finalReport);
          setStreamProgress((prev) => (prev ? { ...prev, isComplete: true, percent: 100 } : null));

          const invalidCount = event.summary?.counts?.invalid || 0;
          if (dryRun) {
            setIsValidated(invalidCount === 0);
            setCurrentStep(4);
          } else {
            setIsDelivered(true);
            setCurrentStep(4);
          }
        },
        onError: (err) => {
          throw err;
        },
      });
    } catch (streamErr) {
      console.warn("SSE stream interrupted; falling back to batch API:", streamErr);
      try {
        const batchReport = await api.executeUploadIngestion(
          rowsToProcess,
          activeMapping,
          dryRun,
          datasetName
        );
        setReport(batchReport);
        setStreamProgress(null);
        const invalidCount = batchReport.summary?.counts?.invalid || 0;
        if (dryRun) {
          setIsValidated(invalidCount === 0);
          setCurrentStep(4);
        } else {
          setIsDelivered(true);
          setCurrentStep(4);
        }
      } catch (e) {
        setError(`Processing failed: ${e.message}`);
      }
    } finally {
      setBusy("");
    }
  };

  // 6. AI Self-Healing Trigger
  const triggerSelfHeal = async (currentReport = report) => {
    if (!currentReport?.results || !fileData?.sample_rows?.[0] || !mapping) return;
    const errors = Array.from(
      new Set(currentReport.results.flatMap((r) => r.errors || []).filter(Boolean))
    );
    if (errors.length === 0) return;

    setBusy("healing");
    setError("");
    setHealingTrack({
      active: true,
      step: 1,
      errorsTotal: errors.length,
      rulesHealed: 0,
      model: "Gemini 2.5 Flash",
      costFormatted: "Calculating...",
      latencyMs: 0,
      changes: [],
    });

    const stepTimer1 = setTimeout(() => {
      setHealingTrack((prev) => ({ ...prev, step: 2 }));
    }, 600);
    const stepTimer2 = setTimeout(() => {
      setHealingTrack((prev) => ({ ...prev, step: 3 }));
    }, 1500);

    try {
      const invalidRow =
        currentReport.results.find((r) => r.status === "invalid" && r.source_record)?.source_record ||
        fileData.sample_rows[0];
      const healRes = await api.autoHealMapping(mapping, invalidRow, errors);
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      if (healRes.ok && healRes.mapping) {
        setHealingTrack((prev) => ({ ...prev, step: 4 }));
        const approvedMapping = { ...healRes.mapping, status: "approved" };
        setMapping(approvedMapping);
        if (healRes.metadata?.llm_metrics) {
          setLlmMetrics(healRes.metadata.llm_metrics);
        }
        const changes = healRes.changes || ["Auto-repaired schema violations"];
        setHealedChanges(changes);

        setHealingTrack({
          active: false,
          step: 5,
          errorsTotal: errors.length,
          rulesHealed: changes.length,
          model: healRes.metadata?.llm_metrics?.model || "gemini-flash-lite-latest",
          costFormatted: healRes.metadata?.llm_metrics?.cost_formatted || "$0.00025",
          latencyMs: healRes.metadata?.llm_metrics?.latency_ms || 1200,
          changes: changes,
        });

        // Automatically trigger pre-flight validation so records immediately flip to validated!
        await runIngestion(true, approvedMapping);
      }
    } catch (e) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setError(`AI Self-Healing failed: ${e.message}`);
      setHealingTrack((prev) => ({ ...prev, active: false }));
      setBusy("");
    }
  };

  // 7. Multi-Scenario Export Center
  const downloadReport = (type = "full") => {
    if (!report?.results || report.results.length === 0) return;

    let targetResults = report.results;
    let filenameSuffix = "Full_Audit_Report.csv";

    if (type === "quarantine") {
      targetResults = report.results.filter(
        (r) => r.status === "invalid" || r.status === "failed"
      );
      filenameSuffix = "Quarantine_Exceptions.csv";
      if (targetResults.length === 0) {
        alert("No quarantined or invalid records found in this batch!");
        return;
      }
    } else if (type === "manifest") {
      targetResults = report.results.filter((r) => r.status === "delivered");
      filenameSuffix = "Delivery_Manifest.csv";
      if (targetResults.length === 0) {
        alert("No delivered records yet. Deliver records first to export the delivery manifest.");
        return;
      }
    }

    let rows = [];

    if (type === "quarantine") {
      rows = targetResults.map((r, i) => {
        const origIdx = report.results.indexOf(r);
        const srcRecord = r.source_record || fileData?.all_rows?.[origIdx] || {};
        return {
          "#": i + 1,
          "Original Row": origIdx + 1,
          "Error Classification":
            r.mapping_details?.error_category ||
            (r.status === "failed" ? "API Delivery Failure" : "FHIR R4 Schema Violation"),
          "Source Identifier": r.source_id,
          "Violations / Errors": (r.errors || []).join(" | "),
          "Remediation Guidance": (r.errors || []).some((e) => e.includes("deceasedDateTime"))
            ? "Format datetime to ISO 8601 or YYYY-MM-DD or use AI Auto-Heal"
            : (r.errors || []).some((e) => e.includes("transform"))
            ? "Auto-heal mapping transforms or edit source record"
            : "Review field values against FHIR R4 schema constraints or use Edit Record",
          ...srcRecord,
        };
      });
    } else if (type === "manifest") {
      rows = targetResults.map((r, i) => {
        const origIdx = report.results.indexOf(r);
        const srcRecord = r.source_record || fileData?.all_rows?.[origIdx] || {};
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
      // Full audit report (all records)
      rows = targetResults.map((r, i) => {
        const origIdx = report.results.indexOf(r);
        const srcRecord = r.source_record || fileData?.all_rows?.[origIdx] || {};
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

    // Collect all distinct headers preserving all 27+ original input columns
    const headerSet = new Set();
    rows.forEach((row) => Object.keys(row).forEach((k) => headerSet.add(k)));
    const headers = Array.from(headerSet);

    // Prepend UTF-8 BOM (\uFEFF) so Microsoft Excel opens it directly without character corruption
    const csvContent =
      "\uFEFF" +
      [
        headers.join(","),
        ...rows.map((row) =>
          headers
            .map((h) => `"${String(row[h] !== undefined && row[h] !== null ? row[h] : "").replace(/"/g, '""')}"`)
            .join(",")
        ),
      ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${datasetName}_${filenameSuffix}`;
    link.click();
  };

  const downloadJSONReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${datasetName}_Medplum_Ingestion_Bundle.json`;
    link.click();
  };

  // 8. In-Place Edit Record Handlers
  const handleStartEdit = (index, result) => {
    const rawRow = result.source_record || fileData?.all_rows?.[index] || {};
    setEditingRow({
      index,
      sourceId: result.source_id,
      errors: result.errors || [],
      data: { ...rawRow },
    });
    setEditingError("");
  };

  const handleSaveEdit = async (formData) => {
    if (!editingRow || !mapping) return;
    try {
      const transformRes = await api.transform(mapping, formData);
      const valErrors = transformRes.validation_errors || [];
      const mapErrors = transformRes.mapping_errors || [];
      const allErrors = [...mapErrors, ...valErrors];

      const updatedAll = [...(fileData.all_rows || [])];
      updatedAll[editingRow.index] = formData;
      setFileData((prev) => ({ ...prev, all_rows: updatedAll }));

      const updatedResults = [...(report?.results || [])];
      const isNowValid = allErrors.length === 0;
      updatedResults[editingRow.index] = {
        ...updatedResults[editingRow.index],
        status: isNowValid ? "dry_run" : "invalid",
        errors: allErrors,
        source_record: formData,
        target_record: transformRes.resource || {},
        reconciliation_table: transformRes.reconciliation_table || [],
        patient_summary: {
          title: formData.fullname || formData.name || "Record",
          subtitle: `Gender: ${transformRes.resource?.gender || "—"} | DOB: ${transformRes.resource?.birthDate || "—"}`,
        },
      };

      const newCounts = {};
      updatedResults.forEach((r) => {
        newCounts[r.status] = (newCounts[r.status] || 0) + 1;
      });

      setReport((prev) => ({
        ...prev,
        summary: { total: updatedAll.length, counts: newCounts },
        results: updatedResults,
      }));

      if (isNowValid) {
        setEditingRow(null);
        if ((newCounts.invalid || 0) === 0 && (newCounts.dry_run || 0) > 0) {
          setIsValidated(true);
        }
      } else {
        setEditingError(allErrors.join("; "));
      }
    } catch (e) {
      setEditingError(`Validation failed: ${e.message}`);
    }
  };

  // 9. Delete/Exclude Record Handler
  const handleDeleteRecord = (index) => {
    const id = fileData?.all_rows?.[index]?.memid || report?.results?.[index]?.source_id || `#${index + 1}`;
    if (!window.confirm(`Exclude record ${id} from this ingestion batch?`)) return;

    const updatedAll = (fileData.all_rows || []).filter((_, i) => i !== index);
    setFileData((prev) => ({ ...prev, all_rows: updatedAll, total_rows: updatedAll.length }));

    const updatedResults = (report?.results || []).filter((_, i) => i !== index);
    const newCounts = {};
    updatedResults.forEach((r) => {
      newCounts[r.status] = (newCounts[r.status] || 0) + 1;
    });

    setReport((prev) => ({
      ...prev,
      summary: { total: updatedAll.length, counts: newCounts },
      results: updatedResults,
    }));

    if ((newCounts.invalid || 0) === 0 && (newCounts.dry_run || 0) > 0) {
      setIsValidated(true);
    }
  };

  // 10. Add Record Handlers
  const handleSaveAddRecord = async (newRow) => {
    if (!newRow || !mapping) return;
    try {
      const transformRes = await api.transform(mapping, newRow);
      const valErrors = transformRes.validation_errors || [];
      const mapErrors = transformRes.mapping_errors || [];
      const allErrors = [...mapErrors, ...valErrors];
      const isNowValid = allErrors.length === 0;

      const updatedAll = [...(fileData.all_rows || []), newRow];
      setFileData((prev) => ({ ...prev, all_rows: updatedAll, total_rows: updatedAll.length }));

      const newResult = {
        source_id: newRow.memid || newRow.id || `row-${updatedAll.length}`,
        status: isNowValid ? "dry_run" : "invalid",
        errors: allErrors,
        source_record: newRow,
        target_record: transformRes.resource || {},
        reconciliation_table: transformRes.reconciliation_table || [],
        patient_summary: {
          title: newRow.fullname || newRow.name || "Record",
          subtitle: `Gender: ${transformRes.resource?.gender || "—"} | DOB: ${transformRes.resource?.birthDate || "—"}`,
        },
      };

      const updatedResults = [...(report?.results || []), newResult];
      const newCounts = {};
      updatedResults.forEach((r) => {
        newCounts[r.status] = (newCounts[r.status] || 0) + 1;
      });

      setReport((prev) => ({
        ...prev,
        summary: { total: updatedAll.length, counts: newCounts },
        results: updatedResults,
      }));

      setIsAddingRecord(false);
      setAddRecordError("");
    } catch (e) {
      setAddRecordError(`Failed to add record: ${e.message}`);
    }
  };

  // Copy helper
  const copyPayload = (key, data) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 2000);
  };

  // Compute Scenario Counts
  const scenarioCounts = {
    ALL: report?.results?.length || 0,
    delivered: (report?.results || []).filter((r) => r.status === "delivered").length,
    created: (report?.results || []).filter((r) => r.status === "delivered" && r.mapping_details?.delivery_action === "created").length,
    updated: (report?.results || []).filter((r) => r.status === "delivered" && r.mapping_details?.delivery_action === "updated").length,
    validated: (report?.results || []).filter((r) => r.status === "dry_run" || r.status === "validated").length,
    invalid: (report?.results || []).filter((r) => r.status === "invalid").length,
    failed: (report?.results || []).filter((r) => r.status === "failed").length,
  };

  // Filter and paginate table results
  const filteredResults = (report?.results || []).filter((r) => {
    if (statusFilter !== "ALL") {
      const actualStatus = r.status === "dry_run" ? "validated" : r.status;
      const deliveryAction = r.mapping_details?.delivery_action;

      if (statusFilter === "created") {
        if (actualStatus !== "delivered" || deliveryAction !== "created") return false;
      } else if (statusFilter === "updated") {
        if (actualStatus !== "delivered" || deliveryAction !== "updated") return false;
      } else if (statusFilter === "quarantined" || statusFilter === "invalid") {
        if (actualStatus !== "invalid" && r.status !== "invalid") return false;
      } else if (statusFilter === "validated" || statusFilter === "dry_run") {
        if (actualStatus !== "validated" && r.status !== "dry_run") return false;
      } else if (actualStatus !== statusFilter && r.status !== statusFilter) {
        return false;
      }
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchId = String(r.source_id || "").toLowerCase().includes(q);
      const matchTitle = String(r.patient_summary?.title || "").toLowerCase().includes(q);
      const matchTarget = String(r.target_id || "").toLowerCase().includes(q);
      if (!matchId && !matchTitle && !matchTarget) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / pageSize));
  const paginatedResults = filteredResults.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <section className="wizard-page-layout">
      {/* 1. Global Multi-Agent Workflow Relay Visualizer */}
      <AgentWorkflowVisualizer
        currentStage={
          isDelivered ? 4 : (report || isValidated) ? 3 : mapping ? 2 : fileData ? 1 : 0
        }
        llmMetrics={llmMetrics || mapping?.metadata?.llm_metrics}
        datasetName={datasetName}
        recordsCount={fileData?.total_rows || 0}
        approved={mapping?.status === "approved"}
        validated={isValidated}
        delivered={isDelivered}
        healingHistory={mapping?.metadata?.healing_history || []}
        onApprove={approveMapping}
      />

      {/* 2. Interactive 4-Step Stepper Header */}
      <StepperHeader
        currentStep={currentStep}
        onSelectStep={setCurrentStep}
        maxUnlockedStep={maxUnlockedStep}
      />

      {error && (
        <div className="error" style={{ marginBottom: "16px" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* 3. Wizard Step Panes */}
      {currentStep === 1 && (
        <Step1SourceIntake
          fileData={fileData}
          datasetName={datasetName}
          setDatasetName={setDatasetName}
          targetResource={targetResource}
          setTargetResource={setTargetResource}
          onFileUpload={handleFileUpload}
          onLoadSample={loadSamplePlanData}
          onProceed={() => setCurrentStep(2)}
          busy={busy}
        />
      )}

      {currentStep === 2 && (
        <Step2MappingContract
          mapping={mapping}
          llmMetrics={llmMetrics}
          targetResource={targetResource}
          onSynthesize={() => synthesizeMapping()}
          onApprove={approveMapping}
          onProceed={() => setCurrentStep(3)}
          busy={busy}
          onEditRule={(idx) => {
            const rule = mapping.rules[idx];
            const newTgt = prompt("Enter new target FHIR path:", rule.target);
            if (newTgt !== null && newTgt.trim()) {
              const updated = [...mapping.rules];
              updated[idx] = { ...rule, target: newTgt.trim() };
              setMapping({ ...mapping, rules: updated });
            }
          }}
          onDeleteRule={(idx) => {
            if (window.confirm("Delete this mapping rule?")) {
              const updated = mapping.rules.filter((_, i) => i !== idx);
              setMapping({ ...mapping, rules: updated });
            }
          }}
          onAddRule={() => {
            const src = prompt("Enter source column name:");
            if (!src) return;
            const tgt = prompt("Enter target FHIR path:", `identifier[0].value`);
            if (!tgt) return;
            const newRule = { source: src.trim(), target: tgt.trim(), transform: "direct", required: false, confidence: 1.0 };
            setMapping({ ...mapping, rules: [...mapping.rules, newRule] });
          }}
        />
      )}

      {currentStep === 3 && (
        <Step3QualityGate
          fileData={fileData}
          report={report}
          isValidated={isValidated}
          busy={busy}
          healingTrack={healingTrack}
          healedChanges={healedChanges}
          llmMetrics={llmMetrics}
          onRunValidation={() => runIngestion(true)}
          onTriggerAutoHeal={() => triggerSelfHeal()}
          onProceed={() => setCurrentStep(4)}
          onViewInvalid={() => {
            setStatusFilter("invalid");
            setCurrentStep(4);
          }}
        />
      )}

      {currentStep === 4 && (
        <Step4ReconciliationHub
          fileData={fileData}
          report={report}
          mapping={mapping}
          targetResource={targetResource}
          datasetName={datasetName}
          busy={busy}
          streamProgress={streamProgress}
          scenarioCounts={scenarioCounts}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          paginatedResults={paginatedResults}
          filteredResults={filteredResults}
          totalPages={totalPages}
          onRunIngestion={runIngestion}
          onDownloadReport={downloadReport}
          onDownloadJSON={downloadJSONReport}
          onStartAddRecord={() => setIsAddingRecord(true)}
          onStartEdit={handleStartEdit}
          onDeleteRecord={handleDeleteRecord}
          onInspectRecord={setActiveRecord}
        />
      )}

      {/* 4. Modals */}
      <EditRecordModal
        editingRow={editingRow}
        editingError={editingError}
        onClose={() => setEditingRow(null)}
        onSave={handleSaveEdit}
      />

      <InspectRecordModal
        activeRecord={activeRecord}
        targetResource={targetResource}
        onClose={() => setActiveRecord(null)}
        copyPayload={copyPayload}
        copiedKey={copiedKey}
      />

      <AddRecordModal
        isOpen={isAddingRecord}
        headers={fileData?.headers || []}
        onClose={() => setIsAddingRecord(false)}
        onSave={handleSaveAddRecord}
        error={addRecordError}
      />
    </section>
  );
}
