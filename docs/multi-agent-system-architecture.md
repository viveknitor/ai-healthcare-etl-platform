# Multi-Agent System Architecture & Agent Roster Specification

This document provides the authoritative architectural specification of the **7 specialized agents** powering the Healthcare ETL & Interoperability Platform. It covers their roles, operational tasks, engine technology stacks, input/output schemas, handoff protocols, and governance gates.

---

## 1. Executive Summary & Agent Census

To achieve autonomous, high-integrity, zero-data-loss ingestion of heterogenous healthcare records into HL7 FHIR R4, the platform operates a coordinated mesh of **6 sequential pipeline relay agents** and **1 autonomous self-healing sub-agent**:

| # | Agent Codename | Identifier | Archetype | Technology Stack | Governance Model | Code Reference |
|---|----------------|------------|-----------|------------------|------------------|----------------|
| **1** | **DataScout Agent** | `agent_1_extraction` | Extraction & Schema Discovery | Python Streaming Parser (`csv`, `openpyxl`, `json`) | Autonomous Execution | `app/upload_pipeline.py` |
| **2** | **AI Architect** | `agent_2_synthesis` | Semantic Reasoning & Mapping Synthesis | Google Gemini 2.5/3.5 Flash via REST | Autonomous Generation | `app/mapping/suggest.py` |
| **3** | **Compliance Officer** | `agent_3_governance` | Human-in-the-Loop Governance | Interactive Operator Sign-off Gate | **Strict Human Approval Gate** | `ui/src/components/UploadPage.jsx` |
| **4** | **Sentinel Validator** | `agent_4_validation` | Structural Schema Gatekeeper | Pydantic FHIR R4/R4B Model Engine | Binary Quality Gate (0 errors to pass) | `app/validation.py`, `app/mapping/engine.py` |
| **4B** | **Self-Healer Sub-Agent** | `agent_4b_healer` | Autonomous Closed-Loop Schema Repair | Gemini LLM + Surgical Diff Engine | Autonomous Closed-Loop Repair | `app/mapping/heal.py` |
| **5** | **Dispatcher Agent** | `agent_5_dispatcher` | Transactional Streaming & Ingestion | Medplum SSE Ingestion Engine | Autonomous Streaming with Backoff | `app/upload_pipeline.py`, `app/connectors/http.py` |
| **6** | **Forensic Auditor** | `agent_6_auditor` | Provenance & Reconciliation Auditor | 3-Perspective Dynamic Engine | Certified Audit Bundle Generation | `app/main.py`, `DynamicReconciliationMatrix.jsx` |

---

## 2. Multi-Agent Relay & Handoff Workflow

The ingestion pipeline executes as a strictly ordered relay. Each agent processes its domain, produces an immutable payload, and passes control to the next agent in the sequence:

```mermaid
flowchart TD
    RawData["Raw Input File<br/>(CSV, Excel .xlsx, TSV, JSON)"] --> Agent1
    
    subgraph S1 ["Stage 1: Discovery"]
        Agent1["🤖 Agent 1: DataScout Agent<br/>(Extraction & Schema Discovery)"]
    end
    
    subgraph S2 ["Stage 2: Semantic Synthesis"]
        Agent2["🧠 Agent 2: AI Architect<br/>(Clinical Semantic Reasoning)"]
    end
    
    subgraph S3 ["Stage 3: Governance Gate"]
        Agent3{"👤 Agent 3: Compliance Officer<br/>(Human-in-the-Loop Operator Gate)"}
    end
    
    subgraph S4 ["Stage 4: Validation & Closed-Loop Repair"]
        Agent4{"🛡️ Agent 4: Sentinel Validator<br/>(Pydantic Schema Gatekeeper)"}
        Agent4B["🩹 Agent 4B: Self-Healer Sub-Agent<br/>(Autonomous Gemini Repair)"]
    end
    
    subgraph S5 ["Stage 5: Transactional Delivery"]
        Agent5["⚡ Agent 5: Dispatcher Agent<br/>(Medplum SSE Streaming Engine)"]
    end
    
    subgraph S6 ["Stage 6: Reconciliation & Audit"]
        Agent6["📊 Agent 6: Forensic Auditor<br/>(3-Perspective Lineage & Audit Bundle)"]
    end
    
    TargetDB[("Medplum FHIR Server<br/>PostgreSQL :8103")]
    AuditReports["Audit Deliverables<br/>(Excel CSV, Delivery Manifest, Quarantine JSON)"]

    Agent1 -->|"Discovered Schema & Sample Payload"| Agent2
    Agent2 -->|"Draft MappingConfig (pending_review)"| Agent3
    Agent3 -->|"Operator Approved & Signed Contract"| Agent4
    
    Agent4 -->|"Validation Violations Intercepted"| Agent4B
    Agent4B -->|"Surgically Healed Contract"| Agent4
    
    Agent4 -->|"100% Validated FHIR Resources"| Agent5
    Agent5 -->|"Idempotent Conditional Upsert (PUT)"| TargetDB
    Agent5 -->|"Delivery Manifest & Receipts"| Agent6
    
    Agent6 --> AuditReports

    classDef agentStyle fill:#1e293b,stroke:#3b82f6,stroke-width:2px,color:#f8fafc;
    classDef gateStyle fill:#312e81,stroke:#a855f7,stroke-width:2px,color:#f8fafc;
    classDef healerStyle fill:#451a03,stroke:#f59e0b,stroke-width:2px,color:#f8fafc;
    classDef targetStyle fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#f8fafc;

    class Agent1,Agent2,Agent5,Agent6 agentStyle;
    class Agent3,Agent4 gateStyle;
    class Agent4B healerStyle;
    class TargetDB,AuditReports targetStyle;
```

---

## 3. Detailed Agent Dossier & Technical Tasks

### Agent 1: DataScout Agent (`agent_1_extraction`)
* **Archetype:** Extraction, Ingestion, and Schema Discovery
* **Technology Stack:** Python Streaming Engine (`app/upload_pipeline.py`, `pandas`, `openpyxl`, `csv`, `json`)
* **Mission:** Ingest arbitrary tabular or semi-structured healthcare data feeds, inspect byte streams, evaluate encodings, extract sanitized sample records, and construct a structured schema manifest.
* **Core Tasks:**
  1. **Encoding & Byte Stream Detection:** Inspects incoming byte streams, detecting and normalizing encodings (UTF-8, Latin-1, Windows-1252, UTF-8 BOM).
  2. **Multi-Format Parsing:** Ingests CSV, TSV, multi-sheet Excel workbooks (`.xlsx`), and line-delimited JSON.
  3. **Header Cleansing:** Trims whitespace, strips invalid characters, and normalizes headers without altering semantic meaning.
  4. **Primary Key Identification:** Evaluates column entropy and heuristics to identify candidate record identifiers (e.g., `memid`, `ssn`, `ExternalId`, `entityid`).
  5. **Sample Payload Packaging:** Extracts de-identified sample rows and packages them into a schema discovery manifest for Agent 2.
* **Input:** Raw binary file upload or database feed (`.csv`, `.xlsx`, `.tsv`, `.json`).
* **Output:** Discovered Schema Manifest and de-identified Sample Record JSON.
* **Handoff Target:** Passes discovery package directly to **Agent 2 (AI Architect)**.

---

### Agent 2: AI Architect (`agent_2_synthesis`)
* **Archetype:** Semantic Reasoning & Mapping Synthesis
* **Technology Stack:** Google Gemini 2.5/3.5 Flash via REST (`app/mapping/suggest.py`)
* **Mission:** Synthesizes an optimal transformation contract (`MappingConfig`) by reasoning over source attributes against the official HL7 FHIR R4 standard.
* **Core Tasks:**
  1. **Clinical Semantic Reasoning:** Identifies clinical and administrative concepts across proprietary column names (e.g., mapping `memdob` $\rightarrow$ `birthDate`, `memsex` $\rightarrow$ `gender`, `pat_lang` $\rightarrow$ `communication[0].language`).
  2. **Deterministic Transform Assignment:** Configures exact deterministic transformations: `date` formatting (`YYYY-MM-DD`), enum value lookups (`map`), string casing (`upper`/`lower`), and whitespace trimming (`strip`).
  3. **Zero-Data-Loss Extension Generation:** Automatically assigns non-standard, business, or unknown columns to typed FHIR extensions (`extension[n].valueString`, `valueBoolean`, `valueDecimal`) under custom or US Core URIs.
  4. **Confidence & Rationale Scoring:** Computes statistical confidence scores ($0.0 \text{ to } 1.0$) and generates clear clinical explanations for each mapping rule.
  5. **Contract Synthesis:** Emits the synthesized `MappingConfig` with status strictly set to `"pending_review"`.
* **Input:** Discovered schema inventory and sample record from Agent 1.
* **Output:** Draft `MappingConfig` JSON contract in `pending_review` status.
* **Handoff Target:** Routes the draft contract to **Agent 3 (Compliance Officer)**.

---

### Agent 3: Compliance Officer (`agent_3_governance`)
* **Archetype:** Human-in-the-Loop Governance & Regulatory Safety Gatekeeper
* **Technology Stack:** Interactive Operator Interface (`ui/src/components/UploadPage.jsx`, `ui/src/components/MappingModal.jsx`, `mappings/patient_mapping.json`)
* **Mission:** Guarantees regulatory compliance (HIPAA, ONC, CMS) by enforcing the non-negotiable rule that **no AI-generated transformation contract may run in production without human operator verification and approval**.
* **Core Tasks:**
  1. **Pipeline Execution Interception:** Halts pipeline progression at Stage 3 in status `"waiting_human"` / `"Awaiting Operator Signature"`.
  2. **Visual Contract Presentation:** Renders an interactive mapping table detailing field-by-field source columns, target FHIR paths, transform operations, confidence badges, and AI rationales.
  3. **Operator Edits & Reversion:** Allows operators to modify paths, adjust date formats, or add custom extensions. Any manual modification automatically resets the contract status to `"pending_review"`.
  4. **Approval & Cryptographic Sign-Off:** Captures operator approval, transitioning the contract to `status: "approved"` and unlocking downstream validation.
* **Input:** Draft `MappingConfig` JSON from Agent 2.
* **Output:** Signed, operator-approved `MappingConfig` (`status: "approved"`).
* **Handoff Target:** Releases the pipeline execution lock to **Agent 4 (Sentinel Validator)**.

---

### Agent 4: Sentinel Validator (`agent_4_validation`)
* **Archetype:** Structural Schema Gatekeeper & Pre-Flight Quality Gate
* **Technology Stack:** Pydantic FHIR R4/R4B Model Engine (`app/validation.py`, `app/mapping/engine.py`)
* **Mission:** Enforces zero-tolerance pre-flight validation against official FHIR R4 schemas before any record touches network or database layers.
* **Core Tasks:**
  1. **Deterministic Record Transformation:** Applies `apply_mapping` to transform source tabular rows into structured FHIR R4 JSON resources.
  2. **Pydantic Model Validation:** Enforces strict Pydantic model validation with `extra="forbid"`, blocking unmapped or illegal properties.
  3. **Value Set & Constraint Enforcement:** Validates FHIR value sets and enum bindings (e.g., `administrative-gender`: `male | female | other | unknown`), ISO-8601 date strings, and mandatory identifiers.
  4. **Binary Quality Gate:** Operates as a zero-error gate. If all records pass, advances the batch directly to Agent 5.
  5. **Exception Routing:** If validation violations occur, captures the structured error diagnostics and routes the failure payload to Agent 4B.
* **Input:** Approved `MappingConfig` from Agent 3 + Source tabular records from Agent 1.
* **Output:** 100% Validated FHIR Resource batch (or failure diagnostic payload).
* **Handoff Target:** Passes cleanly to **Agent 5 (Dispatcher Agent)** if valid; diverts to **Agent 4B (Self-Healer Sub-Agent)** upon error.

---

### Agent 4B: Self-Healer Sub-Agent (`agent_4b_healer`)
* **Archetype:** Autonomous Closed-Loop Schema Repair & Error Remediation
* **Technology Stack:** Closed-Loop Gemini LLM Diagnostic Engine (`app/mapping/heal.py`, `heal_mapping_config`)
* **Mission:** Intercepts schema validation errors and autonomously repairs mapping contracts in a closed-loop cycle without human intervention.
* **Core Tasks:**
  1. **Diagnostic Parsing:** Analyzes Pydantic error traces and schema mismatch logs (e.g. camelCase errors like `multiplebirthBoolean` vs. `multipleBirthBoolean`, string/boolean type mismatches, or missing array index notations).
  2. **LLM Diagnostic Prompting:** Prompts Gemini with the exact failed payload, schema constraints, and current mapping rules.
  3. **Surgical Diff Synthesis:** Synthesizes minimal, targeted rule repairs (correcting property case, converting transforms, adding enum fallbacks) without mutating working rules.
  4. **Closed-Loop Verification:** Re-runs `apply_mapping` and validates the candidate fix against Sentinel Validator to confirm 0 errors.
  5. **Immutable Audit Logging:** Appends the repair details to `healingHistory` for traceability and regulatory audits.
* **Input:** Pydantic validation error list, failed record sample, and active `MappingConfig`.
* **Output:** Surgically healed and validated `MappingConfig`.
* **Handoff Target:** Returns the healed contract to **Agent 4 (Sentinel Validator)** for re-validation, which then advances to **Agent 5**.

---

### Agent 5: Dispatcher Agent (`agent_5_dispatcher`)
* **Archetype:** Transactional Streaming Engine & Database Ingestion Core
* **Technology Stack:** Medplum SSE Streaming Engine (`app/upload_pipeline.py`, `app/connectors/medplum.py`, `app/connectors/http.py`)
* **Mission:** Ingests validated FHIR resources into Medplum's PostgreSQL database over high-speed Server-Sent Events (SSE) streaming with transactional integrity.
* **Core Tasks:**
  1. **Asynchronous SSE Streaming:** Establishes a persistent SSE channel streaming progress events row-by-row to the frontend UI.
  2. **Idempotent Conditional Upserts:** Dispatches records using FHIR conditional upsert (`PUT /Patient?identifier=...`), ensuring safe deduplication and repeatable runs.
  3. **Adaptive Rate-Limiting & Backoff:** Monitors HTTP 429 `too-many-requests` responses, extracts Medplum's `_msBeforeNext` / `Retry-After` reset parameters, and applies micro-pacing to respect the 50,000-point ceiling.
  4. **Live Ingestion Telemetry:** Emits real-time metrics including processed counts, throughput speed (`records/sec`), percentage complete, and ETA.
  5. **Receipt Collection:** Captures Medplum target resource UUIDs, HTTP response codes, and timestamps for every record.
* **Input:** 100% Validated FHIR Resources from Agent 4.
* **Output:** Target Medplum Database UUIDs, Transaction Manifest, and HTTP Delivery Receipts.
* **Handoff Target:** Passes transaction receipts and live database state to **Agent 6 (Forensic Auditor)**.

---

### Agent 6: Forensic Auditor (`agent_6_auditor`)
* **Archetype:** Provenance & Reconciliation Auditor
* **Technology Stack:** Three-Perspective Dynamic Reconciliation Engine (`app/upload_pipeline.py`, `app/main.py`, `ui/src/components/DynamicReconciliationMatrix.jsx`, `ui/src/components/wizard/Step4ReconciliationHub.jsx`)
* **Mission:** Performs end-to-end data provenance certification, proving that every source field was preserved or transformed into the destination FHIR server with Zero Data Loss.
* **Core Tasks:**
  1. **Source-to-Target Reconciliation:** Fetches persisted FHIR resources from Medplum and pairs them with original raw source rows.
  2. **Three-Perspective Matrix Construction:** Builds the field-by-field lineage:
     * *Perspective 1 (Source Input):* Raw extracted attribute value.
     * *Perspective 2 (Transformation Rule):* The deterministic rule applied (direct, date transform, enum map, extension).
     * *Perspective 3 (Target Persisted):* The live value stored in Medplum PostgreSQL storage.
  3. **Attribute Categorization:** Classifies every field into `PRESERVED`, `TRANSFORMED`, `GENERATED`, `EMPTY`, or `QUARANTINED`.
  4. **Certified Deliverable Compilation:** Generates download-ready audit artifacts:
     * **Full Audit CSV:** Complete row-by-row audit dataset with UTF-8 BOM (`\uFEFF`) for native Microsoft Excel rendering.
     * **Delivery Manifest:** Clean JSON of all successfully delivered records and Medplum target IDs.
     * **Quarantine Exceptions:** Isolated report of any failed records with error diagnostics.
     * **FHIR JSON Bundle:** Standardized FHIR transaction bundle for downstream EHR exchanges.
* **Input:** Raw source rows + Medplum delivery receipts and persisted database states from Agent 5.
* **Output:** Certified Reconciliation Audit Bundle, Excel/CSV audit files, and dynamic reconciliation matrix.
* **Handoff Target:** Serves final deliverables to Healthcare Data Stewards, Compliance Teams, and Downstream Systems.

---

## 4. Governance, Safety & Compliance Architecture

The multi-agent system enforces strict healthcare compliance boundaries:

1. **Non-Negotiable Human Gate (Agent 3):**
   - AI cannot deploy transformation logic to production autonomously.
   - Status transitions strictly require operator action:
     $$\text{pending\_review} \xrightarrow{\text{Operator Click / Review}} \text{approved}$$
2. **Deterministic Execution (Agent 4):**
   - Once approved, records are processed using deterministic Python functions (`apply_mapping`), completely independent of LLMs.
   - Pydantic models reject any field outside the validated FHIR R4 schema.
3. **Closed-Loop Auditability (Agent 4B):**
   - Any repair performed by the Self-Healer is permanently recorded in `healingHistory`.
   - The original error, root cause, and surgical diff are preserved for compliance inspection.
4. **End-to-End Provenance (Agent 6):**
   - Every single column from the raw source file is accounted for in the Three-Perspective Reconciliation Matrix.
   - Unmapped or mystery fields are stored in FHIR extensions, guaranteeing **Zero Data Loss**.

---

## 5. UI Visualization & Inspection Modes

In the operator interface (`ui/src/components/AgentWorkflowVisualizer.jsx`), the 7 agents are represented through four interactive modes:

1. **Relay View (Stepper):** Visual step-by-step sequential relay showing stage progression, active agent, duration timers, and live throughput.
2. **Agent Roster (Matrix View):** Full technical matrix displaying all 7 agents side-by-side with archetypes, engines, missions, inputs, actions, and outputs.
3. **Agent Dossier Modal (Inspect 🔍):** Deep-dive dialog detailing an individual agent's telemetry, tool capabilities, and real-time execution status.
4. **Sequential Live Run Feed (`AgentLiveFeed.jsx`):** Animated live task checklist with real-time task checkoffs, auto-collapsing completed rows, and operator approval prompts.

---

## 6. Core Architectural Breakthroughs & Technical Safeguards

To maintain enterprise-grade stability, clinical safety, and corporate firewall compatibility, the multi-agent mesh relies on three fundamental architectural breakthroughs:

### 6.1. Dual-Layer Deduplication & Mathematical Idempotency
* **The Clinical Problem:** In enterprise healthcare data integration, upstream hospitals, EHRs, and payers routinely re-send batch files or trigger network retries. In traditional naive ETL pipelines, processing a 10,000-record batch twice produces **20,000 records** in the database. Duplicate patient records lead to fragmented medical histories, duplicate lab test billings, conflicting medication orders, and severe patient safety risks.
* **Layer 1: In-Batch In-Memory Tracking (`app/pipeline.py` & `app/connectors/hapi.py`):**
  * Maintains an in-memory `seen_ids = set()` tracker across the active streaming ingestion window.
  * If duplicate patient or clinical records appear within the same file or stream, Layer 1 intercepts and skips them before consuming network or database IO.
* **Layer 2: Destination Database Conditional Upsert (`app/connectors/medplum.py`):**
  * Replaces blind `POST /Patient` insertions with official HL7 FHIR **Conditional Upserts**:
    $$\text{PUT } \texttt{/fhir/R4/Patient?identifier=urn:source:hapi|12345}$$
  * Medplum queries its underlying PostgreSQL 16 database:
    * If **0 matches** exist: Inserts the new resource (`HTTP 201 Created`).
    * If **1 match** exists: Updates the existing resource in-place (`HTTP 200 OK`).
* **The Mathematical Idempotency Guarantee:**
  * Satisfies the mathematical idempotency definition $f(f(x)) = f(x)$. Running the exact same dataset **1 time or 100 times** yields exactly **1 clean record** per patient in Medplum PostgreSQL with **zero duplicate rows**.

### 6.2. Auto-Parent Patient Resolution (Referential Integrity)
* **The Clinical Problem:** In HL7 FHIR R4, clinical resources (`Observation`, `Condition`, `Encounter`) cannot exist in a vacuum; they must point to a parent patient via a relative or conditional reference:
  ```json
  "subject": { "reference": "Patient/12345" }
  ```
  If an ETL pipeline delivers an Observation into Medplum before `Patient/12345` has been ingested, the destination server will either reject the record with an `HTTP 400 Bad Request` foreign-key error, or create an "orphan" clinical observation that is completely detached from any patient chart and invisible to physicians.
* **The Solution (`app/pipeline.py`):**
  1. **Cross-Resource Reference Remapping:** Remaps relative foreign keys into deterministic conditional references:
     $$\text{Patient/12345} \longrightarrow \text{Patient?identifier=urn:source:hapi|12345}$$
  2. **Automated Parent Pre-Flight Check:** Before delivering an Observation, Condition, or Encounter, the pipeline inspects Medplum to verify whether the referenced parent `Patient` already exists.
  3. **Auto-Fetch Breakthrough:** If the parent `Patient` is missing, the engine **dynamically pauses the observation delivery, calls HAPI FHIR directly (`GET /baseR4/Patient/12345`), extracts the parent record, sanitizes its metadata, and ingests the parent into Medplum first**.
  4. **Referential Linkage:** Once the parent `Patient` is safely stored in Medplum, the observation's reference is linked and delivered.
* **The Guarantee:** 100% referential integrity across the entire clinical graph, zero orphaned observations, and zero foreign-key constraint violations.

### 6.3. Enterprise Corporate Proxy SSL Bypass (`truststore`)
* **The Enterprise Problem:** Hospital networks, health insurance carriers, and corporate healthcare clouds route outbound internet traffic through enterprise security proxies (e.g. Zscaler, Palo Alto Networks, BlueCoat) that perform deep-packet SSL inspection. These proxies intercept HTTPS traffic using a custom internal Certificate Authority (CA).
  * Standard Python packages (such as `requests` and default `httpx`) rely on `certifi`, a static, hardcoded bundle of public web CAs.
  * Because `certifi` does not include the hospital's private internal CA, Python scripts crash immediately with:
    `ssl.SSLCertVerificationError: certificate verify failed: self-signed certificate in certificate chain`
  * Junior developers frequently bypass this by setting `verify=False`. In healthcare technology, **disabling SSL verification disables transit encryption verification and directly violates HIPAA § 164.312(e)(1) and HITRUST compliance rules**.
* **The Solution (`app/mapping/suggest.py` & `app/main.py`):**
  * The platform integrates the standard Python `truststore` library:
    ```python
    import truststore
    truststore.inject_into_ssl()
    ```
  * `truststore` injects the host operating system's native certificate store (Windows CryptoAPI / System Keychain) directly into Python's SSL context.
  * Because corporate IT departments pre-install internal enterprise proxy CAs into the Windows OS root certificate store, Python automatically recognizes and trusts the corporate proxy.
* **The Guarantee:** Flawless HTTPS connectivity with Google Gemini AI (`generativelanguage.googleapis.com`) and cloud FHIR servers inside strict hospital corporate proxies with **zero security warnings**, **zero custom CA file maintenance**, and **zero insecure `verify=False` hacks**.

---

## 7. Summary Architectural Matrix

| Architectural Breakthrough | Clinical / Technical Risk Mitigated | Implementation Code File | Executive Guarantee |
| :--- | :--- | :--- | :--- |
| **1. Dual-Layer Deduplication** | Duplicate charts, fragmented medical history, billing double-counts | `app/pipeline.py`<br/>`app/connectors/medplum.py` | 100 re-runs produce **0 duplicate records** in Medplum PostgreSQL. |
| **2. Auto-Parent Resolution** | Orphaned lab results, broken clinical foreign keys, HTTP 400 errors | `app/pipeline.py` (lines 80–115) | **100% referential integrity**; missing parent patients auto-fetched from HAPI on the fly. |
| **3. Truststore Proxy Bypass** | SSL handshake failures in corporate firewalls, HIPAA non-compliance | `app/mapping/suggest.py`<br/>`app/main.py` | Native Windows CA injection; **100% encrypted HIPAA transit** with zero insecure flags. |

---

## 8. Related Documentation

- [Master Architecture Specification](architecture.md)
- [HL7 FHIR Extensibility & Zero-Data-Loss Architectural Strategy](fhir-extensibility-and-zero-data-loss.md)
- [HTTP 429 Rate Limiting & Throttling Strategy](http-429-rate-limiting-and-throttling.md)
- [Native Excel OpenXML Date Ingestion & Serialization](excel-support-plan.md)
- [Platform Operations & User Guide](user-guide.md)




