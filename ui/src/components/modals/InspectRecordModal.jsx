import React, { useState, useMemo, useEffect } from "react";
import {
  GitCompare,
  Database,
  Braces,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Zap,
} from "lucide-react";
import { api } from "@/api.js";
import ReconciliationTable from "@/components/ReconciliationTable.jsx";
import AppDialog from "@/components/ui/Dialog.jsx";
import SegmentedTabs from "@/components/ui/Tabs.jsx";
import Badge from "@/components/ui/Badge.jsx";
import Button from "@/components/ui/Button.jsx";

const STATUS_TONE = {
  delivered: "ok",
  dry_run: "brand",
  invalid: "bad",
  failed: "bad",
};

export default function InspectRecordModal({
  activeRecord,
  targetResource = "Patient",
  mapping,
  onClose,
  copyPayload,
  copiedKey,
  sourceLabel = "Source Record",
  enableDestinationTab = true,
}) {
  const [modalTab, setModalTab] = useState("recon");
  const [liveData, setLiveData] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [localCopiedKey, setLocalCopiedKey] = useState("");

  useEffect(() => {
    if (activeRecord) {
      setModalTab("recon");
      setLiveData(null);
      setLiveError("");
      setLocalCopiedKey("");
    }
  }, [activeRecord]);

  const handleCopy = async (key, payload) => {
    if (copyPayload) {
      copyPayload(key, payload);
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload || {}, null, 2));
      setLocalCopiedKey(key);
      setTimeout(() => setLocalCopiedKey(""), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  const activeCopiedKey = copiedKey ?? localCopiedKey;

  const verifyLiveDestination = async () => {
    if (!activeRecord?.target_id) return;
    setLiveLoading(true);
    setLiveError("");
    try {
      const res = await api.getLiveMedplumResource(targetResource, activeRecord.target_id);
      setLiveData(res.resource);
    } catch (err) {
      setLiveError(err.message);
    } finally {
      setLiveLoading(false);
    }
  };

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
        ruleDesc = `Source field empty (${rule.source} -> ${rule.target})`;
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
        label: rule.source,
        source_raw: srcVal,
        source_display: srcDisp,
        rule: ruleDesc,
        status,
        target_raw: tgtVal,
        target_display: tgtDisp,
      });
    });

    Object.keys(src).forEach((col) => {
      if (!mappedSources.has(col)) {
        matrix.push({
          field: col,
          label: col,
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

  const tabItems = [
    { value: "recon", label: "Reconciliation Matrix", icon: GitCompare },
    ...(enableDestinationTab
      ? [{ value: "dest", label: "Destination DB Perspective", icon: Database }]
      : []),
    { value: "raw", label: "Raw JSON Payloads", icon: Braces },
  ];

  const deliveryAction = activeRecord?.mapping_details?.delivery_action;

  return (
    <AppDialog
      open={Boolean(activeRecord)}
      onClose={onClose}
      maxWidth="1120px"
      title={
        activeRecord ? (
          <span className="flex flex-wrap items-center gap-2">
            <span>
              Record Inspector: <code className="text-[var(--brand)]">{activeRecord.source_id}</code>
            </span>
            <Badge tone={STATUS_TONE[activeRecord.status] || "neutral"}>
              {activeRecord.status === "dry_run" ? "validated" : activeRecord.status}
            </Badge>
            {deliveryAction && (
              <Badge tone={deliveryAction === "created" ? "ok" : "info"}>
                {deliveryAction}
              </Badge>
            )}
          </span>
        ) : (
          "Record Inspector"
        )
      }
      subtitle={`HL7 FHIR R4 Resource Lineage (${targetResource})`}
      headerRight={
        activeRecord?.target_id ? (
          <a
            href={`http://localhost:3000/${targetResource}/${activeRecord.target_id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand)] hover:underline"
          >
            <span>Open in Medplum</span>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : null
      }
    >
      {activeRecord && (
        <div className="space-y-4">
          <SegmentedTabs
            ariaLabel="Inspector perspective"
            value={modalTab}
            onChange={setModalTab}
            items={tabItems}
          />

          {modalTab === "recon" && (
            <ReconciliationTable
              table={reconciliationData}
              sourceTitle={sourceLabel}
              targetTitle={`Target ${targetResource} Stored`}
            />
          )}

          {modalTab === "dest" && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                <div>
                  <div className="text-[var(--text-muted)] font-semibold">Target Resource</div>
                  <div className="mt-0.5 font-mono font-bold text-[var(--text-primary)]">{targetResource}</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)] font-semibold">Assigned UUID</div>
                  <div className="mt-0.5 font-mono font-bold text-[var(--text-primary)] break-all">
                    {activeRecord.target_id || "Pending Commit"}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)] font-semibold">Scoped Identifier</div>
                  <div className="mt-0.5 font-mono font-bold text-[var(--text-primary)] break-all">
                    {activeRecord.mapping_details?.idempotent_identifier || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)] font-semibold">Delivery Action</div>
                  <div className="mt-0.5 font-mono font-bold text-[var(--ok)]">
                    {activeRecord.status.toUpperCase()} ({deliveryAction || "ready"})
                  </div>
                </div>
              </div>

              {activeRecord.target_id ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3">
                    <div className="text-xs">
                      <strong className="text-[var(--text-primary)]">Live Database Verification</strong>
                      <div className="text-[var(--text-muted)]">
                        Query Medplum PostgreSQL store directly to confirm live persisted version and timestamp.
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      loading={liveLoading}
                      onClick={verifyLiveDestination}
                    >
                      <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                      {liveLoading ? "Querying Medplum…" : "Verify Live in Medplum DB"}
                    </Button>
                  </div>

                  {liveError && (
                    <div
                      role="alert"
                      className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--bad-border)] bg-[var(--bad-bg)] px-3.5 py-2.5 text-xs text-[var(--bad)]"
                    >
                      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>Verification failed: {liveError}</span>
                    </div>
                  )}

                  {liveData && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--ok-border)] bg-[var(--ok-bg)] px-4 py-3 text-xs">
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-[var(--ok)]">
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          <span>Confirmed Live in Medplum Database</span>
                        </div>
                        <div className="mt-0.5 font-mono text-[var(--text-secondary)]">
                          Version {liveData.meta?.versionId || "1"} • Updated{" "}
                          {liveData.meta?.lastUpdated || "Now"} • ID {liveData.id}
                        </div>
                      </div>
                      <Badge tone="ok">Verified in DB</Badge>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-[var(--radius-md)] border border-[var(--info-border)] bg-[var(--info-bg)] px-4 py-3 text-xs text-[var(--info)]">
                  <strong>Dry Run Mode:</strong> Verified against HL7 FHIR R4 constraints. Deliver this batch to generate a permanent Medplum UUID.
                </div>
              )}

              <ReconciliationTable
                table={reconciliationData.filter(
                  (r) => r.status !== "dropped" && r.status !== "sanitized"
                )}
                sourceTitle="Input Source"
                targetTitle="Committed in Medplum"
              />
            </div>
          )}

          {modalTab === "raw" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="m-0 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    1. {sourceLabel}
                  </h4>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleCopy("src", activeRecord.source_record)}
                  >
                    {activeCopiedKey === "src" ? (
                      <Check className="h-3.5 w-3.5 text-[var(--ok)]" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {activeCopiedKey === "src" ? "Copied" : "Copy Source"}
                  </Button>
                </div>
                <pre
                  translate="no"
                  className="max-h-[400px] rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-code)] p-3.5 text-xs text-[var(--text-primary)]"
                >
                  {JSON.stringify(activeRecord.source_record || {}, null, 2)}
                </pre>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="m-0 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    2. Target Medplum Resource
                  </h4>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      handleCopy("tgt", liveData || activeRecord.target_record)
                    }
                  >
                    {activeCopiedKey === "tgt" ? (
                      <Check className="h-3.5 w-3.5 text-[var(--ok)]" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {activeCopiedKey === "tgt" ? "Copied" : "Copy Target"}
                  </Button>
                </div>
                <pre
                  translate="no"
                  className="max-h-[400px] rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-code)] p-3.5 text-xs text-[var(--text-primary)]"
                >
                  {JSON.stringify(liveData || activeRecord.target_record || {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </AppDialog>
  );
}
