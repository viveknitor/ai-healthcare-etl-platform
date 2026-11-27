import {
  Bot,
  BrainCircuit,
  UserCheck,
  ShieldCheck,
  Wrench,
  Zap,
  FileSearch,
} from "lucide-react";

export const AGENT_DEFS = [
  {
    id: "agent_1_extraction",
    num: 1,
    codename: "DataScout Agent",
    archetype: "Extraction & Discovery",
    icon: Bot,
    engine: "Python Streaming & OpenXML Engine",
    mission:
      "Connects to databases, Excel workbooks (.xlsx), CSV, TSV, or JSON feeds. Discovers headers, normalizes encodings, extracts sample rows, and identifies candidate primary keys.",
    action:
      "Scans raw byte streams, parses tabular columns, cleans headers, and strips invalid characters.",
    handoffSummary: "Discovered Schema & Sample Payload",
    passesTo: "AI Architect (Agent 2)",
    tasks: [
      "Connect to data source",
      "Discover headers & encodings",
      "Extract de-identified sample records",
      "Identify primary keys",
      "Package schema payload",
    ],
  },
  {
    id: "agent_2_synthesis",
    num: 2,
    codename: "AI Architect",
    archetype: "Semantic Reasoning",
    icon: BrainCircuit,
    engine: "Google Gemini Flash",
    mission:
      "Analyzes proprietary clinical field names against HL7 FHIR R4. Synthesizes deterministic mapping rules (date, map, strip) and zero-data-loss FHIR extensions.",
    action:
      "Executes clinical semantic reasoning, maps proprietary concepts to FHIR paths, and scores confidence.",
    handoffSummary: "Draft FHIR R4 Mapping Contract",
    passesTo: "Compliance Officer (Agent 3)",
    tasks: [
      "Receive schema payload from Agent 1",
      "Execute clinical semantic reasoning",
      "Map proprietary concepts to FHIR R4 paths",
      "Calculate confidence scores",
      "Generate transformation contract",
    ],
  },
  {
    id: "agent_3_governance",
    num: 3,
    codename: "Compliance Officer",
    archetype: "Human-in-the-Loop Governance",
    icon: UserCheck,
    engine: "Human Operator Verification Gate",
    mission:
      "Enforces regulatory safety (HIPAA, ONC, CMS) by preventing AI-synthesized transformation logic from deploying without explicit human inspection and approval.",
    action:
      "Presents interactive rule tables, lineage flows, and raw JSON contract for operator sign-off.",
    handoffSummary: "Approved & Signed Mapping Contract",
    passesTo: "Sentinel Validator (Agent 4)",
    isGate: true,
    tasks: [
      "Receive draft mapping contract",
      "Present for operator review",
      "Await operator signature",
    ],
  },
  {
    id: "agent_4_validation",
    num: 4,
    codename: "Sentinel Validator",
    archetype: "Structural Schema Gatekeeper",
    icon: ShieldCheck,
    engine: "Pydantic FHIR R4/R4B Engine",
    mission:
      "Executes zero-tolerance pre-flight validation. Enforces strict schema conformance, value-set bindings, ISO-8601 dates, and required attributes.",
    action:
      "Transforms source records into FHIR R4 resources and validates against strict Pydantic models. Invokes Agent 4B on errors.",
    handoffSummary: "100% Validated FHIR Resources",
    passesTo: "Dispatcher Agent (Agent 5)",
    tasks: [
      "Receive approved mapping contract",
      "Transform source records to FHIR R4",
      "Run Pydantic strict validation",
      "Enforce enum bindings & ISO timestamps",
      "Gate: 0 errors to pass",
    ],
  },
  {
    id: "agent_4b_healer",
    num: "4B",
    codename: "Self-Healer Sub-Agent",
    archetype: "Autonomous Schema Repair",
    icon: Wrench,
    engine: "Closed-Loop Gemini Diff Engine",
    mission:
      "Intercepts schema validation errors and synthesizes surgical rule fixes (casing, transforms, date formats) with immutable audit logging.",
    action:
      "Diagnoses Pydantic traces, repairs mismatched rules, and triggers closed-loop re-validation.",
    handoffSummary: "Repaired Mapping Contract",
    passesTo: "Sentinel Validator (Agent 4)",
    isSubAgent: true,
    tasks: [
      "Diagnose schema violations",
      "Query Gemini for repair candidates",
      "Apply targeted field corrections",
      "Re-validate repaired records",
    ],
  },
  {
    id: "agent_5_dispatcher",
    num: 5,
    codename: "Dispatcher Agent",
    archetype: "Transactional Streaming Engine",
    icon: Zap,
    engine: "Medplum SSE Ingestion Engine",
    mission:
      "Delivers validated FHIR resources into Medplum PostgreSQL via Server-Sent Events streaming and idempotent conditional upserts.",
    action:
      "Streams records row-by-row, respects adaptive 429 pacing, performs conditional upserts, and collects UUID receipts.",
    handoffSummary: "Target Medplum UUIDs & Receipts",
    passesTo: "Forensic Auditor (Agent 6)",
    tasks: [
      "Receive validated FHIR resources",
      "Open SSE stream to Medplum :8103",
      "Stream row-by-row with idempotent upserts",
      "Track HTTP status codes",
      "Confirm persistence",
    ],
  },
  {
    id: "agent_6_auditor",
    num: 6,
    codename: "Forensic Auditor",
    archetype: "Provenance & Reconciliation",
    icon: FileSearch,
    engine: "Three-Perspective Dynamic Engine",
    mission:
      "Certifies end-to-end data provenance. Compares raw source fields against live Medplum storage and builds Excel (UTF-8 BOM) & JSON audit bundles.",
    action:
      "Computes source-to-target field diffs, certifies lineage, and packages downloadable audit deliverables.",
    handoffSummary: "Certified Reconciliation Audit Bundle",
    passesTo: "Healthcare Operations & Compliance",
    tasks: [
      "Receive source attributes + Medplum state",
      "Compute source-to-target field diffs",
      "Certify zero data loss",
      "Format Excel (UTF-8 BOM) & JSON reports",
      "Publish audit bundle",
    ],
  },
];
