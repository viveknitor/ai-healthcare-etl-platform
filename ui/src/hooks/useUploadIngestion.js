import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/api.js";
import { useAppStore } from "@/stores/useAppStore.js";
import {
  appendAllRemainingExtensionRules,
  appendSingleExtensionRule,
} from "@/utils/extensionInference.js";
import { exportUploadBatchReport, downloadJsonFile } from "@/utils/exportReports.js";

export const SAMPLE_PLANDATA_ROWS = [
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

export function computeScenarioCounts(results = []) {
  const counts = {
    ALL: results.length,
    delivered: 0,
    created: 0,
    updated: 0,
    validated: 0,
    invalid: 0,
    failed: 0,
  };
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "delivered") {
      counts.delivered++;
      const act = r.mapping_details?.delivery_action;
      if (act === "created") counts.created++;
      else if (act === "updated") counts.updated++;
    } else if (r.status === "dry_run" || r.status === "validated") {
      counts.validated++;
    } else if (r.status === "invalid") {
      counts.invalid++;
    } else if (r.status === "failed") {
      counts.failed++;
    }
  }
  return counts;
}

const COL_PRESET_KEY = (res) => `healthcare_etl_col_preset_${res || "Patient"}`;

function readSavedColPreset(res) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(COL_PRESET_KEY(res));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function pickColumns(row = {}, cols = []) {
  if (!cols || cols.length === 0) return row;
  const out = {};
  cols.forEach((c) => {
    if (c in row) out[c] = row[c];
  });
  return out;
}

export function useUploadIngestion() {
  const setActiveBatch = useAppStore((s) => s.setActiveBatch);
  const refreshHealthAndStats = useAppStore((s) => s.refreshHealthAndStats);
  const openConfirm = useAppStore((s) => s.openConfirm);

  const [currentStep, setCurrentStep] = useState(1);
  const [fileData, setFileData] = useState(null);
  const [targetResource, setTargetResource] = useState("Patient");
  const [datasetName, setDatasetName] = useState("PlanData-Member");
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [presetApplied, setPresetApplied] = useState(false);
  const [mapping, setMapping] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [activeRecord, setActiveRecord] = useState(null);
  const [isValidated, setIsValidated] = useState(false);
  const [isDelivered, setIsDelivered] = useState(false);
  const [llmMetrics, setLlmMetrics] = useState(null);
  const [healedChanges, setHealedChanges] = useState([]);
  const [savingContract, setSavingContract] = useState(false);
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

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [streamProgress, setStreamProgress] = useState(null);

  const [editingRow, setEditingRow] = useState(null);
  const [editingError, setEditingError] = useState("");
  const [isAddingRecord, setIsAddingRecord] = useState(false);
  const [addRecordError, setAddRecordError] = useState("");
  const [confirmDeliveryModalOpen, setConfirmDeliveryModalOpen] = useState(false);

  const streamAbortRef = useRef(null);

  // Keep TopHeader batch indicator synchronized
  useEffect(() => {
    if (fileData) {
      setActiveBatch({
        datasetName,
        rowCount: fileData.total_rows,
        targetResource,
        stage: currentStep,
      });
    } else {
      setActiveBatch(null);
    }
  }, [fileData, datasetName, targetResource, currentStep, setActiveBatch]);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  const rawHeaders = fileData?.headers || [];
  const allHeaders = selectedColumns.length > 0 ? selectedColumns : rawHeaders;
  const mappedSources = useMemo(
    () => new Set((mapping?.rules || []).map((r) => r.source)),
    [mapping]
  );
  const unmappedHeaders = useMemo(
    () => allHeaders.filter((h) => !mappedSources.has(h)),
    [allHeaders, mappedSources]
  );

  let maxUnlockedStep = 1;
  if (fileData) maxUnlockedStep = 2;
  if (mapping) maxUnlockedStep = 3;
  if (report || isValidated) maxUnlockedStep = 4;

  const synthesizeMapping = useCallback(
    async (data = fileData, cols = selectedColumns) => {
      if (!data?.sample_rows?.[0]) return;
      setBusy("suggest");
      setError("");
      try {
        const filteredSample = pickColumns(data.sample_rows[0], cols);
        const m = await api.suggestMapping(filteredSample, targetResource);
        setMapping(m);
        if (m.metadata?.llm_metrics) {
          setLlmMetrics(m.metadata.llm_metrics);
        }
      } catch (e) {
        setError(`AI synthesis failed: ${e.message}`);
        toast.error(`AI synthesis failed: ${e.message}`);
      } finally {
        setBusy("");
      }
    },
    [fileData, selectedColumns, targetResource]
  );

  const initColumnsFromHeaders = (headers = []) => {
    const saved = readSavedColPreset(targetResource);
    if (saved) {
      const matched = headers.filter((h) => saved.includes(h));
      if (matched.length > 0 && matched.length < headers.length) {
        setSelectedColumns(matched);
        setPresetApplied(true);
        return matched;
      }
    }
    setSelectedColumns(headers);
    setPresetApplied(false);
    return headers;
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setBusy("upload");
    setError("");
    setReport(null);
    setMapping(null);
    setIsValidated(false);
    setIsDelivered(false);
    setHealedChanges([]);
    try {
      const res = await api.uploadFile(file);
      setFileData(res);
      setDatasetName(file.name.replace(/\.[^/.]+$/, ""));
      const cols = initColumnsFromHeaders(res.headers || []);
      toast.success(
        cols.length < (res.headers?.length || 0)
          ? `Loaded ${res.total_rows} records · Restored ${cols.length}/${res.headers.length} columns`
          : `Loaded ${res.total_rows} records from ${res.filename}`
      );
    } catch (e) {
      setError(`Failed to parse file: ${e.message}`);
      toast.error(`Failed to parse file: ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  const loadSamplePlanData = async () => {
    setBusy("upload");
    setError("");
    setReport(null);
    setMapping(null);
    setIsValidated(false);
    setIsDelivered(false);
    setHealedChanges([]);
    try {
      const headers = Object.keys(SAMPLE_PLANDATA_ROWS[0]);
      const syntheticFileData = {
        filename: "PlanData_Members_Sample.csv",
        total_rows: SAMPLE_PLANDATA_ROWS.length,
        headers,
        sample_rows: SAMPLE_PLANDATA_ROWS,
        all_rows: SAMPLE_PLANDATA_ROWS,
      };
      setFileData(syntheticFileData);
      setDatasetName("PlanData-Member");
      initColumnsFromHeaders(headers);
      toast.success("Loaded 3 sample PlanData rows");
    } catch (e) {
      setError(`Failed to load sample: ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  const proceedFromStep1 = async () => {
    if (!fileData) return;
    const cols = selectedColumns.length > 0 ? selectedColumns : fileData.headers || [];
    if (typeof window !== "undefined" && cols.length > 0) {
      localStorage.setItem(COL_PRESET_KEY(targetResource), JSON.stringify(cols));
    }
    setCurrentStep(2);
    if (!mapping) {
      await synthesizeMapping(fileData, cols);
    }
  };

  const approveMapping = (advanceStep = false) => {
    if (!mapping) return;
    const approved = { ...mapping, status: "approved" };
    setMapping(approved);
    toast.success("Mapping contract approved and signed");
    if (advanceStep) setCurrentStep(3);
  };

  const saveCurrentContract = async () => {
    if (!mapping) return;
    setSavingContract(true);
    try {
      const res = await api.saveMapping(mapping);
      toast.success(`Saved contract to mappings/${res.filename}`);
    } catch (e) {
      toast.error(`Failed to save contract: ${e.message}`);
    } finally {
      setSavingContract(false);
    }
  };

  const handleMapAllRemaining = () => {
    if (!mapping) return;
    setMapping(appendAllRemainingExtensionRules(mapping, unmappedHeaders));
    setIsValidated(false);
    setIsDelivered(false);
    toast.info(`Mapped ${unmappedHeaders.length} remaining columns as FHIR extensions (Pending Review)`);
  };

  const handleMapSingleExtension = (col) => {
    if (!mapping) return;
    setMapping(appendSingleExtensionRule(mapping, col));
    setIsValidated(false);
    setIsDelivered(false);
  };

  const handleEditRuleField = (idx, field, value) => {
    if (!mapping?.rules) return;
    const updated = [...mapping.rules];
    updated[idx] = { ...updated[idx], [field]: value };
    setMapping({ ...mapping, status: "pending_review", rules: updated });
    setIsValidated(false);
    setIsDelivered(false);
  };

  const handleRemoveRule = (idx) => {
    if (!mapping?.rules) return;
    const updated = mapping.rules.filter((_, i) => i !== idx);
    setMapping({ ...mapping, status: "pending_review", rules: updated });
    setIsValidated(false);
    setIsDelivered(false);
  };

  const handleAddRule = ({ source, target, transform = "direct" }) => {
    if (!mapping || !source || !target) return;
    const newRule = {
      source,
      target,
      transform,
      required: false,
      confidence: 1.0,
      rationale: "Custom user-added rule",
    };
    setMapping({
      ...mapping,
      status: "pending_review",
      rules: [...(mapping.rules || []), newRule],
    });
    setIsValidated(false);
    setIsDelivered(false);
  };

  const cancelIngestion = () => {
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
      setBusy("");
      setStreamProgress((prev) => (prev ? { ...prev, cancelled: true } : null));
      toast.warning("Streaming ingestion cancelled");
    }
  };

  const runIngestion = async (dryRun = false, activeMapping = mapping) => {
    if (!fileData?.all_rows || !activeMapping) return;
    const preparedMapping =
      activeMapping.status === "approved"
        ? activeMapping
        : { ...activeMapping, status: "approved" };
    if (activeMapping.status !== "approved") {
      setMapping(preparedMapping);
    }

    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;

    setBusy(dryRun ? "validate" : "ingest");
    setError("");
    setCurrentPage(1);

    const rowsToProcess = fileData.all_rows;
    const tempResults = [];
    let latestCounts = { delivered: 0, dry_run: 0, invalid: 0, failed: 0 };
    let latestIndex = 0;
    let flushScheduled = false;
    const startTime = Date.now();

    setStreamProgress({
      current: 0,
      total: rowsToProcess.length,
      percent: 0,
      recordsPerSec: 0,
      isComplete: false,
      cancelled: false,
    });

    const flushProgress = () => {
      flushScheduled = false;
      const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
      const recPerSec = Math.round(latestIndex / elapsedSec);
      setStreamProgress({
        current: latestIndex,
        total: rowsToProcess.length,
        percent: Math.round((latestIndex / Math.max(1, rowsToProcess.length)) * 100),
        recordsPerSec: recPerSec,
        isComplete: false,
        cancelled: false,
      });
      setReport({
        summary: { total: rowsToProcess.length, counts: latestCounts },
        results: [...tempResults],
      });
    };

    try {
      await api.executeUploadIngestionStream({
        rows: rowsToProcess,
        mapping: preparedMapping,
        dry_run: dryRun,
        dataset_name: datasetName,
        signal: controller.signal,
        onRecord: (event) => {
          tempResults.push(event.result);
          latestIndex = event.index;
          latestCounts = event.current_counts;
          if (!flushScheduled) {
            flushScheduled = true;
            setTimeout(flushProgress, 80);
          }
        },
        onComplete: (event) => {
          const finalReport = {
            summary: event.summary,
            results: [...tempResults],
          };
          setReport(finalReport);
          setStreamProgress((prev) =>
            prev ? { ...prev, current: rowsToProcess.length, isComplete: true, percent: 100 } : null
          );

          const invalidCount = event.summary?.counts?.invalid || 0;
          if (dryRun) {
            setIsValidated(invalidCount === 0);
            setCurrentStep(4);
            if (invalidCount === 0) {
              toast.success(`Pre-flight validation passed for all ${rowsToProcess.length} records`);
            } else {
              toast.warning(`${invalidCount} record(s) quarantined during validation`);
            }
          } else {
            setIsDelivered(true);
            setCurrentStep(4);
            toast.success(`Delivered ${event.summary?.counts?.delivered || 0} records to Medplum`);
          }
          refreshHealthAndStats();
        },
        onError: (err) => {
          throw err;
        },
      });
    } catch (streamErr) {
      if (streamErr?.name === "AbortError") return;
      console.warn("SSE stream interrupted; falling back to batch API:", streamErr);
      try {
        const batchReport = await api.executeUploadIngestion(
          rowsToProcess,
          preparedMapping,
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
        refreshHealthAndStats();
      } catch (e) {
        setError(`Processing failed: ${e.message}`);
        toast.error(`Processing failed: ${e.message}`);
      }
    } finally {
      if (streamAbortRef.current === controller) {
        streamAbortRef.current = null;
      }
      setBusy("");
    }
  };

  const handleInitiateDelivery = () => {
    const invalidCount = report?.summary?.counts?.invalid || 0;
    if (invalidCount > 0) {
      setConfirmDeliveryModalOpen(true);
    } else {
      runIngestion(false);
    }
  };

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
      model: "Gemini Flash",
      costFormatted: "Calculating…",
      latencyMs: 0,
      changes: [],
    });

    const stepTimer1 = setTimeout(() => {
      setHealingTrack((prev) => ({ ...prev, step: 2 }));
    }, 550);
    const stepTimer2 = setTimeout(() => {
      setHealingTrack((prev) => ({ ...prev, step: 3 }));
    }, 1300);

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
          changes,
        });

        toast.success(`AI Self-Healer repaired ${changes.length} rule(s); re-validating…`);
        await runIngestion(true, approvedMapping);
      }
    } catch (e) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setError(`AI Self-Healing failed: ${e.message}`);
      toast.error(`AI Self-Healing failed: ${e.message}`);
      setHealingTrack((prev) => ({ ...prev, active: false }));
      setBusy("");
    }
  };

  const downloadReport = (type = "full") => {
    const res = exportUploadBatchReport({
      results: report?.results || [],
      allRows: fileData?.all_rows || [],
      type,
      datasetName,
      targetResource,
    });
    if (!res.ok) {
      toast.info(res.reason);
    } else {
      toast.success(`Exported ${res.count} row(s) to ${res.filename}`);
    }
  };

  const downloadJSONReport = () => {
    if (!report) return;
    downloadJsonFile(report, `${datasetName}_Medplum_Ingestion_Bundle.json`);
    toast.success(`Downloaded ${datasetName}_Medplum_Ingestion_Bundle.json`);
  };

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
        toast.success(`Record ${editingRow.sourceId} remediated and validated`);
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

  const handleBulkFixCategory = async (group) => {
    if (!group?.fixes?.length || !mapping || !fileData) return;
    setBusy("bulk_fix");
    try {
      const updatedAll = [...(fileData.all_rows || [])];
      const updatedResults = [...(report?.results || [])];

      const revalResults = await Promise.all(
        group.fixes.map(async ({ index, col, suggestedFix }) => {
          const baseRow = updatedResults[index]?.source_record || updatedAll[index] || {};
          const nextRow = { ...baseRow, [col]: suggestedFix };
          updatedAll[index] = nextRow;
          const transformRes = await api.transform(mapping, nextRow);
          return { index, nextRow, transformRes };
        })
      );

      let fixedCount = 0;
      revalResults.forEach(({ index, nextRow, transformRes }) => {
        const valErrors = transformRes.validation_errors || [];
        const mapErrors = transformRes.mapping_errors || [];
        const allErrors = [...mapErrors, ...valErrors];
        const isNowValid = allErrors.length === 0;
        if (isNowValid) fixedCount++;

        updatedResults[index] = {
          ...updatedResults[index],
          status: isNowValid ? "dry_run" : "invalid",
          errors: allErrors,
          source_record: nextRow,
          target_record: transformRes.resource || {},
          reconciliation_table: transformRes.reconciliation_table || [],
          patient_summary: {
            title: nextRow.fullname || nextRow.name || "Record",
            subtitle: `Gender: ${transformRes.resource?.gender || "—"} | DOB: ${transformRes.resource?.birthDate || "—"}`,
          },
        };
      });

      const newCounts = {};
      updatedResults.forEach((r) => {
        newCounts[r.status] = (newCounts[r.status] || 0) + 1;
      });

      setFileData((prev) => ({ ...prev, all_rows: updatedAll }));
      setReport((prev) => ({
        ...prev,
        summary: { total: updatedAll.length, counts: newCounts },
        results: updatedResults,
      }));

      if ((newCounts.invalid || 0) === 0 && (newCounts.dry_run || 0) > 0) {
        setIsValidated(true);
      }
      toast.success(`Fixed and validated ${fixedCount} of ${group.fixes.length} record(s)`);
    } catch (e) {
      toast.error(`Bulk fix failed: ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  const handleDeleteRecord = async (index) => {
    const id =
      fileData?.all_rows?.[index]?.memid ||
      report?.results?.[index]?.source_id ||
      `#${index + 1}`;
    const confirmed = await openConfirm({
      title: `Exclude record ${id}?`,
      description: `This removes record ${id} from the active ingestion batch before Medplum delivery.`,
      confirmLabel: "Exclude Record",
      tone: "danger",
    });
    if (!confirmed) return;

    const updatedAll = (fileData.all_rows || []).filter((_, i) => i !== index);
    setFileData((prev) => ({
      ...prev,
      all_rows: updatedAll,
      total_rows: updatedAll.length,
    }));

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
    toast.success(`Excluded record ${id} from batch`);
  };

  const handleSaveAddRecord = async (newRow) => {
    if (!newRow || !mapping) return;
    try {
      const transformRes = await api.transform(mapping, newRow);
      const valErrors = transformRes.validation_errors || [];
      const mapErrors = transformRes.mapping_errors || [];
      const allErrors = [...mapErrors, ...valErrors];
      const isNowValid = allErrors.length === 0;

      const updatedAll = [...(fileData.all_rows || []), newRow];
      setFileData((prev) => ({
        ...prev,
        all_rows: updatedAll,
        total_rows: updatedAll.length,
      }));

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
      toast.success(`Added record ${newResult.source_id} to batch`);
    } catch (e) {
      setAddRecordError(`Failed to add record: ${e.message}`);
    }
  };

  const scenarioCounts = useMemo(
    () => computeScenarioCounts(report?.results || []),
    [report?.results]
  );

  const filteredResults = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return (report?.results || []).filter((r) => {
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
      if (q) {
        const matchId = String(r.source_id || "").toLowerCase().includes(q);
        const matchTitle = String(r.patient_summary?.title || "").toLowerCase().includes(q);
        const matchTarget = String(r.target_id || "").toLowerCase().includes(q);
        if (!matchId && !matchTitle && !matchTarget) return false;
      }
      return true;
    });
  }, [report?.results, statusFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedResults = useMemo(
    () => filteredResults.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredResults, safePage, pageSize]
  );

  return {
    currentStep,
    setCurrentStep,
    maxUnlockedStep,
    fileData,
    targetResource,
    setTargetResource,
    datasetName,
    setDatasetName,
    mapping,
    busy,
    error,
    report,
    activeRecord,
    setActiveRecord,
    isValidated,
    isDelivered,
    llmMetrics,
    healedChanges,
    savingContract,
    healingTrack,
    statusFilter,
    setStatusFilter,
    searchTerm,
    setSearchTerm,
    currentPage: safePage,
    setCurrentPage,
    pageSize,
    setPageSize,
    streamProgress,
    editingRow,
    setEditingRow,
    editingError,
    isAddingRecord,
    setIsAddingRecord,
    addRecordError,
    confirmDeliveryModalOpen,
    setConfirmDeliveryModalOpen,
    allHeaders,
    selectedColumns,
    setSelectedColumns,
    presetApplied,
    setPresetApplied,
    proceedFromStep1,
    handleBulkFixCategory,
    mappedSources,
    unmappedHeaders,
    scenarioCounts,
    filteredResults,
    paginatedResults,
    totalPages,
    handleFileUpload,
    loadSamplePlanData,
    synthesizeMapping,
    approveMapping,
    saveCurrentContract,
    handleMapAllRemaining,
    handleMapSingleExtension,
    handleEditRuleField,
    handleRemoveRule,
    handleAddRule,
    runIngestion,
    cancelIngestion,
    handleInitiateDelivery,
    triggerSelfHeal,
    downloadReport,
    downloadJSONReport,
    handleStartEdit,
    handleSaveEdit,
    handleDeleteRecord,
    handleSaveAddRecord,
  };
}
