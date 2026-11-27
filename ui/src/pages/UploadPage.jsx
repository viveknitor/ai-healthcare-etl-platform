import React from "react";
import { AlertCircle } from "lucide-react";
import { useUploadIngestion } from "@/hooks/useUploadIngestion.js";
import AgentWorkflowVisualizer from "@/components/AgentWorkflowVisualizer.jsx";
import StepperHeader from "@/components/wizard/StepperHeader.jsx";
import Step1SourceIntake from "@/components/wizard/Step1SourceIntake.jsx";
import Step2MappingContract from "@/components/wizard/Step2MappingContract.jsx";
import Step3QualityGate from "@/components/wizard/Step3QualityGate.jsx";
import Step4ReconciliationHub from "@/components/wizard/Step4ReconciliationHub.jsx";
import EditRecordModal from "@/components/modals/EditRecordModal.jsx";
import InspectRecordModal from "@/components/modals/InspectRecordModal.jsx";
import AddRecordModal from "@/components/modals/AddRecordModal.jsx";
import DeliveryConfirmationModal from "@/components/modals/DeliveryConfirmationModal.jsx";

export default function UploadPage() {
  const s = useUploadIngestion();

  return (
    <section className="space-y-5">
      <StepperHeader
        currentStep={s.currentStep}
        onSelectStep={s.setCurrentStep}
        maxUnlockedStep={s.maxUnlockedStep}
      />

      {s.error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--bad-border)] bg-[var(--bad-bg)] px-4 py-3 text-xs font-medium text-[var(--bad)]"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Error:</strong> {s.error}
          </span>
        </div>
      )}

      {s.currentStep === 1 && (
        <Step1SourceIntake
          fileData={s.fileData}
          datasetName={s.datasetName}
          setDatasetName={s.setDatasetName}
          targetResource={s.targetResource}
          setTargetResource={s.setTargetResource}
          selectedColumns={s.selectedColumns}
          setSelectedColumns={s.setSelectedColumns}
          presetApplied={s.presetApplied}
          onFileUpload={s.handleFileUpload}
          onLoadSample={s.loadSamplePlanData}
          onProceed={s.proceedFromStep1}
          busy={s.busy}
        />
      )}

      {s.currentStep === 2 && (
        <Step2MappingContract
          mapping={s.mapping}
          llmMetrics={s.llmMetrics}
          allHeaders={s.allHeaders}
          mappedSources={s.mappedSources}
          unmappedHeaders={s.unmappedHeaders}
          onSynthesize={() => s.synthesizeMapping()}
          onApprove={s.approveMapping}
          onSaveContract={s.saveCurrentContract}
          savingContract={s.savingContract}
          onProceed={() => s.setCurrentStep(3)}
          busy={s.busy}
          onMapAllRemaining={s.handleMapAllRemaining}
          onMapSingleExtension={s.handleMapSingleExtension}
          onEditRule={s.handleEditRuleField}
          onRemoveRule={s.handleRemoveRule}
          onAddRule={s.handleAddRule}
        />
      )}

      {s.currentStep === 3 && (
        <Step3QualityGate
          fileData={s.fileData}
          report={s.report}
          isValidated={s.isValidated}
          busy={s.busy}
          healingTrack={s.healingTrack}
          healedChanges={s.healedChanges}
          llmMetrics={s.llmMetrics}
          onRunValidation={() => s.runIngestion(true)}
          onTriggerAutoHeal={() => s.triggerSelfHeal()}
          onInitiateDelivery={s.handleInitiateDelivery}
          onProceed={() => s.setCurrentStep(4)}
          onViewInvalid={() => {
            s.setStatusFilter("invalid");
            s.setCurrentStep(4);
          }}
        />
      )}

      {s.currentStep === 4 && (
        <Step4ReconciliationHub
          fileData={s.fileData}
          report={s.report}
          mapping={s.mapping}
          targetResource={s.targetResource}
          datasetName={s.datasetName}
          busy={s.busy}
          streamProgress={s.streamProgress}
          scenarioCounts={s.scenarioCounts}
          statusFilter={s.statusFilter}
          setStatusFilter={s.setStatusFilter}
          searchTerm={s.searchTerm}
          setSearchTerm={s.setSearchTerm}
          currentPage={s.currentPage}
          setCurrentPage={s.setCurrentPage}
          pageSize={s.pageSize}
          setPageSize={s.setPageSize}
          paginatedResults={s.paginatedResults}
          filteredResults={s.filteredResults}
          totalPages={s.totalPages}
          onRunIngestion={s.handleInitiateDelivery}
          onCancelIngestion={s.cancelIngestion}
          onDownloadReport={s.downloadReport}
          onDownloadJSON={s.downloadJSONReport}
          onStartAddRecord={() => s.setIsAddingRecord(true)}
          onStartEdit={s.handleStartEdit}
          onDeleteRecord={s.handleDeleteRecord}
          onInspectRecord={s.setActiveRecord}
          onBulkFix={s.handleBulkFixCategory}
        />
      )}

      <AgentWorkflowVisualizer
        defaultCollapsed={true}
        llmMetrics={s.llmMetrics || s.mapping?.metadata?.llm_metrics}
        datasetName={s.datasetName}
        recordsCount={s.fileData?.total_rows || 0}
        approved={s.mapping?.status === "approved"}
        validated={s.isValidated}
        delivered={s.isDelivered}
        healingHistory={s.mapping?.metadata?.healing_history || []}
        onApprove={() => s.approveMapping(false)}
        onReject={() => s.setCurrentStep(2)}
      />

      <EditRecordModal
        editingRow={s.editingRow}
        editingError={s.editingError}
        headers={s.fileData?.headers || []}
        onClose={() => s.setEditingRow(null)}
        onSave={s.handleSaveEdit}
      />

      <InspectRecordModal
        activeRecord={s.activeRecord}
        targetResource={s.targetResource}
        mapping={s.mapping}
        sourceLabel="Source Uploaded Record"
        onClose={() => s.setActiveRecord(null)}
      />

      <AddRecordModal
        isOpen={s.isAddingRecord}
        headers={s.fileData?.headers || []}
        onClose={() => s.setIsAddingRecord(false)}
        onSave={s.handleSaveAddRecord}
        error={s.addRecordError}
      />

      <DeliveryConfirmationModal
        isOpen={s.confirmDeliveryModalOpen}
        onClose={() => s.setConfirmDeliveryModalOpen(false)}
        onConfirm={() => {
          s.setConfirmDeliveryModalOpen(false);
          s.runIngestion(false);
        }}
        onReviewQuarantine={() => {
          s.setConfirmDeliveryModalOpen(false);
          s.setStatusFilter("invalid");
          s.setCurrentStep(4);
        }}
        validCount={
          s.scenarioCounts.validated ||
          Math.max(
            0,
            (s.report?.summary?.total || s.fileData?.total_rows || 0) -
              (s.report?.summary?.counts?.invalid || 0)
          )
        }
        invalidCount={s.report?.summary?.counts?.invalid || 0}
        targetResource={s.targetResource}
        datasetName={s.datasetName}
      />
    </section>
  );
}
