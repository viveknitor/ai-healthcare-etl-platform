import React, { useState, useEffect } from "react";
import {
  Sparkles,
  CheckCircle2,
  Play,
  GitCompare,
  Braces,
  FolderOpen,
  AlertCircle,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api.js";
import MappingContractViewer from "@/components/MappingContractViewer.jsx";
import ReconciliationTable from "@/components/ReconciliationTable.jsx";
import SegmentedTabs from "@/components/ui/Tabs.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card.jsx";

const SAMPLE_PRESETS = {
  Patient: {
    member_id: "M1001",
    fname: "John",
    lname: "Smith",
    dob: "1990-01-15",
    sex: "M",
  },
  Observation: {
    obs_id: "OBS-8821",
    patient_id: "M1001",
    loinc_code: "8867-4",
    display: "Heart rate",
    value: 72,
    unit: "beats/min",
    recorded_at: "2026-10-15T09:30:00Z",
  },
  Condition: {
    cond_id: "COND-410",
    patient_id: "M1001",
    icd10: "I10",
    description: "Essential hypertension",
    onset_date: "2024-03-11",
    clinical_status: "active",
  },
};

export default function MappingPage() {
  const [sampleText, setSampleText] = useState(
    JSON.stringify(SAMPLE_PRESETS.Patient, null, 2)
  );
  const [target, setTarget] = useState("Patient");
  const [mapping, setMapping] = useState(null);
  const [savedMappings, setSavedMappings] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [savingContract, setSavingContract] = useState(false);
  const [error, setError] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [resultTab, setResultTab] = useState("table");

  useEffect(() => {
    api
      .getMappings()
      .then((res) => setSavedMappings(res?.mappings || []))
      .catch(() => {});
  }, []);

  function parseSample() {
    try {
      const parsed = JSON.parse(sampleText);
      setJsonError("");
      return parsed;
    } catch (e) {
      const msg = `Invalid JSON: ${e.message}`;
      setJsonError(msg);
      throw new Error(msg);
    }
  }

  function prettifySample() {
    try {
      const parsed = parseSample();
      setSampleText(JSON.stringify(parsed, null, 2));
      toast.success("Formatted JSON payload");
    } catch {
      // jsonError already displayed inline
    }
  }

  async function suggest() {
    setBusy("suggest");
    setError("");
    setPreview(null);
    try {
      const sample = parseSample();
      const suggested = await api.suggestMapping(sample, target);
      setMapping(suggested);
      toast.success("Synthesized draft FHIR R4 mapping contract");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function test() {
    setBusy("test");
    setError("");
    try {
      const sample = parseSample();
      const res = await api.transform(mapping, sample);
      setPreview(res);
      toast.success("Transformation preview complete");
    } catch (e) {
      setError(e.message);
      setPreview(null);
    } finally {
      setBusy("");
    }
  }

  async function handleSaveContract() {
    if (!mapping) return;
    setSavingContract(true);
    try {
      const res = await api.saveMapping(mapping);
      toast.success(`Saved contract to mappings/${res.filename}`);
      const listRes = await api.getMappings();
      setSavedMappings(listRes?.mappings || []);
    } catch (e) {
      toast.error(`Failed to save contract: ${e.message}`);
    } finally {
      setSavingContract(false);
    }
  }

  function editRule(i, field, value) {
    const rules = mapping.rules.map((r, j) => (j === i ? { ...r, [field]: value } : r));
    setMapping({ ...mapping, status: "pending_review", rules });
    setPreview(null);
  }

  function removeRule(i) {
    setMapping({
      ...mapping,
      status: "pending_review",
      rules: mapping.rules.filter((_, j) => j !== i),
    });
    setPreview(null);
  }

  function addRule({ source, target: tgtPath, transform = "direct" }) {
    setMapping({
      ...mapping,
      status: "pending_review",
      rules: [
        ...(mapping.rules || []),
        {
          source,
          target: tgtPath,
          transform,
          required: false,
          confidence: 1.0,
          rationale: "Custom studio rule",
        },
      ],
    });
    setPreview(null);
  }

  const approved = mapping?.status === "approved";
  const activeModel = mapping?.metadata?.llm_metrics?.model || "Gemini Flash";

  let sampleKeys = [];
  try {
    sampleKeys = Object.keys(JSON.parse(sampleText) || {});
  } catch {
    sampleKeys = [];
  }
  const mappedSet = new Set((mapping?.rules || []).map((r) => r.source));

  return (
    <section className="space-y-5">
      {/* Studio Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-4 shadow-[var(--shadow-sm)]">
        <div className="space-y-0.5">
          <h2 className="m-0 text-base font-bold text-[var(--text-primary)]">
            AI Schema Mapping &amp; Synthesis Studio
          </h2>
          <p className="m-0 text-xs text-[var(--text-muted)]">
            Synthesize HL7 FHIR R4 mapping contracts from sample records, inspect saved contracts, and verify transforms safely.
          </p>
        </div>
        <Badge tone="ai" icon={Sparkles}>
          Model: {activeModel}
        </Badge>
      </div>

      {/* Top Row: Sample Input + Saved Contracts & Governance */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h3">1. Source Record Sample</CardTitle>
              <CardDescription>
                Paste a raw legacy EHR JSON record or choose a preset sample.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.keys(SAMPLE_PRESETS).map((presetKey) => (
                <Button
                  key={presetKey}
                  size="sm"
                  variant={target === presetKey ? "primary" : "secondary"}
                  onClick={() => {
                    setTarget(presetKey);
                    setSampleText(JSON.stringify(SAMPLE_PRESETS[presetKey], null, 2));
                    setJsonError("");
                  }}
                >
                  {presetKey}
                </Button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="studio-sample-json" className="text-xs font-semibold text-[var(--text-secondary)]">
                  Sample JSON Payload
                </label>
                <Button size="sm" variant="ghost" onClick={prettifySample}>
                  Format JSON
                </Button>
              </div>
              <textarea
                id="studio-sample-json"
                rows={10}
                spellCheck={false}
                aria-invalid={jsonError ? "true" : undefined}
                aria-describedby={jsonError ? "studio-json-err" : undefined}
                value={sampleText}
                onChange={(e) => {
                  setSampleText(e.target.value);
                  if (jsonError) setJsonError("");
                }}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-code)] p-3 font-mono text-xs text-[var(--text-primary)]"
              />
              {jsonError && (
                <div id="studio-json-err" role="alert" className="mt-1 text-xs font-medium text-[var(--bad)]">
                  {jsonError}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <label htmlFor="studio-target-res" className="block text-xs font-semibold text-[var(--text-secondary)]">
                  Target Resource
                </label>
                <input
                  id="studio-target-res"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="Patient, Observation…"
                  className="h-[36px] w-[180px] rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs"
                />
              </div>

              <Button
                variant="primary"
                loading={busy === "suggest"}
                onClick={suggest}
              >
                {busy !== "suggest" && <Wand2 className="h-4 w-4" aria-hidden="true" />}
                {busy === "suggest" ? "AI Reasoning…" : "Suggest Mapping"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h3">2. Saved Contracts &amp; Governance Gate</CardTitle>
              <CardDescription>
                Load persisted mappings from <code>mappings/</code> or approve &amp; test the active contract.
              </CardDescription>
            </div>
            {mapping && (
              <Badge tone={approved ? "ok" : "warn"}>
                {approved ? "Approved" : "Pending Review"}
              </Badge>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {savedMappings.length > 0 && (
              <div className="space-y-1.5">
                <label htmlFor="saved-contract-select" className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                  <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Load Saved Contract ({savedMappings.length})</span>
                </label>
                <select
                  id="saved-contract-select"
                  defaultValue=""
                  onChange={(e) => {
                    const found = savedMappings.find((m) => m.name === e.target.value);
                    if (found) {
                      setMapping(found);
                      setTarget(found.target_resource || "Patient");
                      setPreview(null);
                      toast.info(`Loaded contract "${found.name}"`);
                    }
                  }}
                  className="h-[36px] w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs"
                >
                  <option value="" disabled>
                    Select a saved mapping contract…
                  </option>
                  {savedMappings.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name} (v{m.version} • {m.target_resource} • {m.rules?.length || 0} rules)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!mapping ? (
              <EmptyState
                variant="first-run"
                title="No active mapping contract"
                description="Click Suggest Mapping on your sample payload or choose a saved contract above to begin."
                actionLabel="Suggest Mapping"
                onAction={suggest}
              />
            ) : (
              <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)]/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <strong className="text-sm text-[var(--text-primary)]">{mapping.name}</strong>{" "}
                    <span className="font-mono text-[var(--text-muted)]">v{mapping.version}</span>
                    <div className="text-[var(--text-muted)] tabular-nums">
                      {mapping.rules?.length || 0} rules targeting {mapping.target_resource}
                    </div>
                  </div>
                  <Badge tone={approved ? "ok" : "warn"}>
                    {approved ? "Gate Cleared" : "Approval Required"}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <Button
                    variant={approved ? "secondary" : "success"}
                    disabled={approved}
                    onClick={() => setMapping({ ...mapping, status: "approved" })}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    {approved ? "Schema Approved" : "Approve Mapping"}
                  </Button>

                  <Button
                    variant="primary"
                    loading={busy === "test"}
                    disabled={!approved || busy === "test"}
                    onClick={test}
                  >
                    {busy !== "test" && <Play className="h-4 w-4" aria-hidden="true" />}
                    {busy === "test" ? "Transforming…" : "Test on Sample"}
                  </Button>
                </div>
                {!approved && (
                  <p className="m-0 text-xs text-[var(--text-muted)]">
                    Approve Mapping is required before running Test on Sample (Governance Gate).
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--bad-border)] bg-[var(--bad-bg)] px-4 py-3 text-xs font-medium text-[var(--bad)]"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Unified Contract Editor */}
      {mapping && (
        <MappingContractViewer
          mapping={mapping}
          approved={approved}
          allHeaders={sampleKeys}
          mappedSources={mappedSet}
          unmappedHeaders={sampleKeys.filter((k) => !mappedSet.has(k))}
          onEditRule={editRule}
          onRemoveRule={removeRule}
          onAddRule={addRule}
          onSaveContract={handleSaveContract}
          savingContract={savingContract}
        />
      )}

      {/* Transformation & Reconciliation Result */}
      {preview && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h3">3. Transformation &amp; Reconciliation Matrix</CardTitle>
              <CardDescription>
                Live FHIR R4 validation output and field-level derivation trace.
              </CardDescription>
            </div>
            <SegmentedTabs
              ariaLabel="Transform output view"
              value={resultTab}
              onChange={setResultTab}
              items={[
                { value: "table", label: "Reconciliation Matrix", icon: GitCompare },
                { value: "json", label: "Raw FHIR JSON", icon: Braces },
              ]}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone={preview.mapping_errors.length ? "warn" : "ok"}>
                Mapping Errors: {preview.mapping_errors.length}
              </Badge>
              <Badge tone={preview.validation_errors.length ? "bad" : "ok"}>
                FHIR R4 Validation: {preview.validation_errors.length ? "Failed" : "Passed"}
              </Badge>
            </div>

            {[...preview.mapping_errors, ...preview.validation_errors].map((errMsg, idx) => (
              <div
                key={idx}
                role="alert"
                className="rounded-[var(--radius-sm)] border border-[var(--bad-border)] bg-[var(--bad-bg)] px-3 py-2 text-xs text-[var(--bad)]"
              >
                {errMsg}
              </div>
            ))}

            {resultTab === "table" ? (
              <ReconciliationTable
                table={preview.reconciliation_table}
                sourceTitle="Input Source Sample"
                targetTitle={`Target ${target} Payload`}
              />
            ) : (
              <pre
                translate="no"
                className="max-h-[420px] rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-code)] p-4 text-xs text-[var(--text-primary)]"
              >
                {JSON.stringify(preview.resource, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
