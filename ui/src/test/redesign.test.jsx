import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  buildCsvString,
} from "@/utils/exportReports.js";
import {
  inferFhirExtensionValueType,
  appendAllRemainingExtensionRules,
} from "@/utils/extensionInference.js";
import {
  convertExcelSerialToIso,
  normalizeLocalDateToIso,
  parseHumanDiagnostic,
  groupFixableQuarantineIssues,
} from "@/utils/errorDiagnostics.js";
import { computeScenarioCounts } from "@/hooks/useUploadIngestion.js";
import MappingContractViewer from "@/components/MappingContractViewer.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import DropZone from "@/components/ui/DropZone.jsx";
import EditRecordModal from "@/components/modals/EditRecordModal.jsx";
import SidebarNav from "@/components/layout/SidebarNav.jsx";
import Step1SourceIntake from "@/components/wizard/Step1SourceIntake.jsx";
import AgentWorkflowVisualizer from "@/components/AgentWorkflowVisualizer.jsx";
import { useAppStore } from "@/stores/useAppStore.js";

describe("exportReports utilities", () => {
  it("builds UTF-8 BOM CSV with escaped quotes", () => {
    const csv = buildCsvString([
      { memid: "M1", note: 'Has "quoted", text' },
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Has ""quoted"", text"');
  });
});

describe("extensionInference utilities", () => {
  it("infers FHIR extension value types accurately", () => {
    expect(inferFhirExtensionValueType("medincome")).toBe("valueDecimal");
    expect(inferFhirExtensionValueType("isvip")).toBe("valueBoolean");
    expect(inferFhirExtensionValueType("EligibilityOfficeId")).toBe("valueString");
  });

  it("appends remaining columns and resets status to pending_review", () => {
    const mapping = {
      name: "test",
      status: "approved",
      rules: [{ source: "memid", target: "identifier[0].value", transform: "direct" }],
    };
    const next = appendAllRemainingExtensionRules(mapping, ["medincome", "isvip"]);
    expect(next.status).toBe("pending_review");
    expect(next.rules).toHaveLength(3);
    expect(next.rules[1].target).toBe("extension[0].valueDecimal");
    expect(next.rules[2].target).toBe("extension[1].valueBoolean");
  });
});

describe("errorDiagnostics utilities", () => {
  it("converts Excel serial dates (39216, 18476) to ISO YYYY-MM-DD", () => {
    expect(convertExcelSerialToIso("39216")).toBe("2007-05-14");
    expect(convertExcelSerialToIso("18476")).toBe("1950-08-01");
    expect(convertExcelSerialToIso("1990-01-15")).toBeNull();
  });

  it("prioritizes dob column and offers 1-click serial fix", () => {
    const diag = parseHumanDiagnostic(
      "birthDate; Value error, Date value string does not match spec regex. [input_value='39216']",
      { lastupdate: "39216", dob: "39216" },
      "MEM-100"
    );
    expect(diag.col).toBe("dob");
    expect(diag.suggestedFix).toBe("2007-05-14");
  });

  it("normalizes DD-Mon-YYYY and YY-MM-DD locally and groups bulk quarantine fixes", () => {
    expect(normalizeLocalDateToIso("15-Jun-1985")).toBe("1985-06-15");
    expect(normalizeLocalDateToIso("85-06-15")).toBe("1985-06-15");

    const groups = groupFixableQuarantineIssues(
      [
        { status: "dry_run", errors: [], source_record: { memid: "M1", dob: "1985-06-15" } },
        {
          status: "invalid",
          source_id: "M2",
          errors: ["1 validation error for Patient\nbirthDate"],
          source_record: { memid: "M2", dob: "15-Jun-1985" },
        },
        {
          status: "invalid",
          source_id: "M3",
          errors: ["1 validation error for Patient\nbirthDate"],
          source_record: { memid: "M3", dob: "85-06-15" },
        },
      ],
      []
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("date_format");
    expect(groups[0].count).toBe(2);
    expect(groups[0].fixes[0].suggestedFix).toBe("1985-06-15");
    expect(groups[0].fixes[1].suggestedFix).toBe("1985-06-15");
  });
});

describe("computeScenarioCounts", () => {
  it("counts delivered, created, updated, validated, invalid, failed in one pass", () => {
    const counts = computeScenarioCounts([
      { status: "delivered", mapping_details: { delivery_action: "created" } },
      { status: "delivered", mapping_details: { delivery_action: "updated" } },
      { status: "dry_run" },
      { status: "invalid" },
      { status: "failed" },
    ]);
    expect(counts).toEqual({
      ALL: 5,
      delivered: 2,
      created: 1,
      updated: 1,
      validated: 1,
      invalid: 1,
      failed: 1,
    });
  });
});

describe("Redesigned UI components", () => {
  it("MappingContractViewer creates custom rule inline without window.prompt", () => {
    const onAddRule = vi.fn();
    render(
      <MappingContractViewer
        mapping={{
          name: "patient_test",
          status: "approved",
          rules: [{ source: "memid", target: "identifier[0].value", transform: "direct", required: true }],
        }}
        approved={true}
        allHeaders={["memid", "isvip"]}
        mappedSources={new Set(["memid"])}
        unmappedHeaders={["isvip"]}
        onEditRule={() => {}}
        onRemoveRule={() => {}}
        onAddRule={onAddRule}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /add custom rule/i }));
    fireEvent.change(screen.getByLabelText(/source column/i), { target: { value: "isvip" } });
    fireEvent.change(screen.getByLabelText(/^Target FHIR Path$/i), {
      target: { value: "extension[0].valueBoolean" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add rule$/i }));

    expect(onAddRule).toHaveBeenCalledWith({
      source: "isvip",
      target: "extension[0].valueBoolean",
      transform: "direct",
    });
  });

  it("DropZone rejects unsupported extensions inline", () => {
    const onFile = vi.fn();
    const { container } = render(<DropZone onFileSelected={onFile} />);
    const input = container.querySelector('input[type="file"]');
    const badFile = new File(["abc"], "malware.exe", { type: "application/octet-stream" });
    fireEvent.change(input, { target: { files: [badFile] } });
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/unsupported file/i);
  });

  it("EmptyState renders filtered-to-zero clear button", () => {
    const onReset = vi.fn();
    render(
      <EmptyState
        variant="filtered"
        title='No records match "xyz"'
        actionLabel="Clear Filters"
        onAction={onReset}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear Filters" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("EditRecordModal applies 1-click serial date fix inside dialog", () => {
    render(
      <EditRecordModal
        editingRow={{
          index: 0,
          sourceId: "MEM-9",
          errors: ["birthDate; Date value string does not match spec regex. [input_value='39216']"],
          data: { memid: "MEM-9", dob: "39216" },
        }}
        headers={["memid", "dob"]}
        onClose={() => {}}
        onSave={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /apply fix: 2007-05-14/i }));
    expect(screen.getByLabelText("dob")).toHaveValue("2007-05-14");
    expect(screen.getByRole("status")).toHaveTextContent(/dob:/i);
  });

  it("SidebarNav triggers tab navigation and displays minimal status indicator", () => {
    const onSelectTab = vi.fn();
    render(
      <SidebarNav
        activeTab="overview"
        onSelectTab={onSelectTab}
        isCollapsed={false}
        onToggleCollapse={() => {}}
      />
    );

    expect(useAppStore.getState().theme).toBe("light");
    expect(screen.getByText("FHIR R4")).toBeInTheDocument();
    expect(screen.getByText("Connecting…")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /New Ingestion/i }));
    expect(onSelectTab).toHaveBeenCalledWith("upload");

    expect(screen.queryByRole("button", { name: /Slate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Auto/i })).not.toBeInTheDocument();
  });

  it("Step1SourceIntake renders two-column Phase 1 layout with What We'll Do guide, column selector, and Next Step", () => {
    const onLoadSample = vi.fn();
    const onProceed = vi.fn();
    const setSelectedColumns = vi.fn();
    render(
      <Step1SourceIntake
        fileData={{
          filename: "test.csv",
          total_rows: 1,
          headers: ["memid", "dob", "lastupdate"],
          sample_rows: [{ memid: "M1", dob: "1985-06-15", lastupdate: "2025-01-01" }],
        }}
        datasetName="PlanData"
        setDatasetName={() => {}}
        targetResource="Patient"
        setTargetResource={() => {}}
        selectedColumns={["memid", "dob", "lastupdate"]}
        setSelectedColumns={setSelectedColumns}
        onFileUpload={() => {}}
        onLoadSample={onLoadSample}
        onProceed={onProceed}
        busy={null}
      />
    );

    expect(screen.getByText("Phase 1: Upload & Describe")).toBeInTheDocument();
    expect(screen.getByText("SOURCE DATA")).toBeInTheDocument();
    expect(screen.getByText("WHAT WE'LL DO")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next Step/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /Columns \(3\/3\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /FHIR Core/i }));
    expect(setSelectedColumns).toHaveBeenCalledWith(["memid", "dob"]);

    fireEvent.click(screen.getByRole("tab", { name: /Sample Dataset/i }));
    fireEvent.click(screen.getByRole("button", { name: /Load Sample Data/i }));
    expect(onLoadSample).toHaveBeenCalledTimes(1);
  });

  it("AgentWorkflowVisualizer collapses by default when defaultCollapsed is true and expands on Details", () => {
    render(<AgentWorkflowVisualizer defaultCollapsed={true} recordsCount={0} />);
    expect(screen.getByText("Agent Pipeline")).toBeInTheDocument();
    expect(screen.queryByText("Extraction")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Details/i }));
    expect(screen.getByText("Extraction")).toBeInTheDocument();
  });

  it("useAppStore openConfirm resolves async without window.confirm", async () => {
    const promise = useAppStore.getState().openConfirm({
      title: "Deliver batch?",
      confirmLabel: "Deliver",
    });
    expect(useAppStore.getState().confirmRequest?.title).toBe("Deliver batch?");
    useAppStore.getState().resolveConfirm(true);
    await expect(promise).resolves.toBe(true);
    expect(useAppStore.getState().confirmRequest).toBeNull();
  });
});
