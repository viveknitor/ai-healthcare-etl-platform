# Field Coverage & Extension Strategy: Core Mappings vs. Zero-Data-Loss Extensions

This document defines the architectural standard, clinical rationale, and technical mechanics governing why the AI Architect maps certain columns automatically (e.g. 14 core fields) while presenting remaining columns (e.g. 14 unmapped fields) as optional extensions via the **`✨ Map All Remaining Columns as Extensions`** action.

---

## 1. Executive Summary & The Problem Statement

When ingesting enterprise healthcare datasets (such as `member_sample_data_650_rows`), the schema discovery engine identifies **28 distinct tabular columns**:

```
Total Discovered Columns (28):
├── 14 Standard Clinical & Demographic Attributes (Auto-Mapped by Gemini)
└── 14 Institutional, Internal Audit & SDoH Attributes (Surfaced for Human Review)
```

The user interface displays:
> **Field Coverage: 14 Mapped • 14 Unmapped / Skipped / 28 Total Columns [50% Coverage]**
> `[✨ Map All 14 Remaining Columns as Extensions (28/28 • 100%)]`

This raises two fundamental architectural questions:
1. **Why does Google Gemini (AI Architect) only map 14 fields automatically instead of all 28?**
2. **Why does the platform provide the option to map all remaining columns as extensions rather than forcing it or dropping them?**

---

## 2. The 14 Automatically Mapped Columns: Base HL7 FHIR R4

The 14 columns mapped automatically represent core clinical and demographic attributes that have **official, standardized, 1-to-1 representations** in the international HL7 FHIR R4 `Patient` resource specification:

| # | Source Column | Target FHIR R4 Element | Clinical / Demographic Meaning | HL7 FHIR Status |
|:---:|---|---|---|:---:|
| **1** | `memid` | `identifier[0].value` | Member Identifier (Primary Key) | Core Standard |
| **2** | `ssn` | `identifier[1].value` | Social Security Number | Core Standard |
| **3** | `entityid` | `identifier[2].value` | Organizational Entity ID | Core Standard |
| **4** | `umin` | `identifier[3].value` | Unique Member Identification Number | Core Standard |
| **5** | `secondaryid` | `identifier[4].value` | Secondary / Alternate ID | Core Standard |
| **6** | `enterpriseid` | `identifier[5].value` | Enterprise Master Patient Index (EMPI) | Core Standard |
| **7** | `ExternalId` | `identifier[6].value` | Upstream EHR / Billing System ID | Core Standard |
| **8** | `fullname` | `name[0].text` | Full Legal Patient Name | Core Standard |
| **9** | `dob` | `birthDate` | Date of Birth | Core Standard |
| **10** | `sex` | `gender` | Administrative Gender (`male\|female\|...`) | Core Standard |
| **11** | `status` | `active` | Active Membership Boolean Status | Core Standard |
| **12** | `primarylanguage` | `communication[0].language.coding[0].code` | Preferred Language | Core Standard |
| **13** | `marital` | `maritalStatus.coding[0].code` | Marital Status Code | Core Standard |
| **14** | `multiplebirth` | `multipleBirthBoolean` | Twin / Multiple Birth Indicator | Core Standard |

Because these 14 attributes are universally recognized across all healthcare systems globally, the AI Architect maps them with high confidence ($0.90 \text{ to } 1.0$) directly to canonical FHIR paths.

---

## 3. The 14 Unmapped / Skipped Columns: The Proprietary & Audit Layer

The remaining 14 columns **do not exist** anywhere in the official international HL7 FHIR `Patient` schema:

| # | Unmapped Column | What It Represents in Source System | Why Base FHIR Has No Standard Field |
|:---:|---|---|---|
| **1** | `lastupdate` | SQL Server row update timestamp | Internal DB plumbing; not a clinical healthcare attribute |
| **2** | `updateid` | SQL Server user ID who modified the row | Internal database administrator account |
| **3** | `createdate` | SQL Server row creation timestamp | Internal DB plumbing; not patient clinical history |
| **4** | `createid` | SQL Server user ID who inserted the row | Internal database administrator account |
| **5** | `externalediting` | Database record edit lock flag | Software application flag |
| **6** | `EligibilityOfficeId` | Regional insurance branch office identifier | Payer-specific institutional hierarchy |
| **7** | `GenderIdentityId` | State-specific or institutional gender code | Non-standard; requires extension in international FHIR |
| **8** | `obs_ethnicid` | Hospital proprietary ethnicity code | Covered by US Core extensions, not base international FHIR |
| **9** | `headofhouse` | Primary policyholder / guarantor name | Complex relationship; often mapped to `contact` or extension |
| **10** | `guardian` | Legal guardian name | Complex relationship; often mapped to `contact` or extension |
| **11** | `medincome` | Median household income (SDoH) | Social Determinants of Health extension |
| **12** | `isvip` | Hospital executive / VIP privacy flag | Proprietary healthcare business flag |
| **13** | `issubscriber` | Insurance policyholder flag (`Y`/`N`) | Payer membership eligibility attribute |
| **14** | `deathdate` | Date of death | Standard is `deceasedDateTime`, but requires date verification |

### The AI Prompt Constraint
In `app/mapping/suggest.py`, rule 5 explicitly guides Gemini:
> *"5. Internal Database Audit Columns (e.g. createdate, createid, lastupdate, updateid, externalediting): omit or map only if required."*

The AI Architect is specifically trained **not to hallucinate or force-fit database plumbing columns into clinical fields**, leaving them for human inspection.

---

## 4. Why Does the Platform Give You the Option to "Map All"?

### A. The HL7 FHIR 80/20 Pareto Principle
Health Level Seven International (HL7) deliberately engineered FHIR around an architectural rule:
* **The 80% (Core Specification):** Defines only elements universally shared by 80% of health systems worldwide (e.g. name, birth date, gender, address, telecom).
* **The 20% (Extensibility):** Local laws, payer rules, and database internals. HL7 explicitly forbids adding proprietary fields to core schemas. Instead, HL7 mandates:
  > *"Every custom, local, or institutional field must be modeled as a FHIR Extension (`extension[n]`)."*

### B. The Two Competing Enterprise Philosophies

In healthcare integration, organizations operate under two diametrically opposed data policies:

```
┌────────────────────────────────────────────────────────┐   ┌────────────────────────────────────────────────────────┐
│             PHILOSOPHY 1: LEAN CLINICAL                │   │             PHILOSOPHY 2: ZERO DATA LOSS               │
├────────────────────────────────────────────────────────┤   ├────────────────────────────────────────────────────────┤
│ • Mandate: "Only send clinical data."                  │   │ • Mandate: "Data is Gold!"                             │
│ • Rationale: Skipping database audit IDs (updateid,    │   │ • Rationale: Every single column, even SQL plumbing,   │
│   lastupdate, createid) keeps FHIR payloads small,     │   │   must be preserved in FHIR extensions for audit,      │
│   fast, and strictly focused on patient care.          │   │   reconciliation, and regulatory defense 10 years out. │
│ • Preferred by: Mobile Health Apps, Telehealth,        │   │ • Preferred by: Enterprise Data Warehouses, Payers,    │
│   Public Health Registries, Direct Care Portals.       │   │   EHR System Migrations, Legal & Compliance Teams.     │
└────────────────────────────────────────────────────────┘   └────────────────────────────────────────────────────────┘
```

Because our platform is designed for both clinical purists and enterprise data engineers, the **Compliance Officer Agent (Human-in-the-Loop)** empowers the operator with 3 distinct pathways:

1. **Leave Them Omitted (50% Lean Clinical):** Ingest only the 14 verified clinical attributes without payload bloat.
2. **Selective Granular Mapping:** Click individual yellow pills (e.g. `+ isvip`, `+ medincome`, `+ EligibilityOfficeId`) to add only specific business extensions needed by downstream systems.
3. **100% Zero Data Loss:** Click **`✨ Map All 14 Remaining Columns as Extensions (28/28 • 100%)`** to instantly convert all 14 extra columns into typed FHIR extensions (`valueString`, `valueBoolean`, `valueDecimal`).

---

## 5. Technical Mechanics of the "Map All Remaining" Action

When the operator clicks **`✨ Map All 14 Remaining Columns as Extensions`** in `ui/src/pages/UploadPage.jsx`:

1. **Dynamic Type Inference:**
   The client analyzes column semantics to choose the optimal FHIR `value[x]` primitive:
   ```javascript
   if (lower.includes("income") || lower.includes("amount") || lower.includes("cost")) {
     valType = "valueDecimal";  // medincome -> extension[N].valueDecimal
   } else if (lower.startsWith("is") || lower.startsWith("has") || lower.includes("flag")) {
     valType = "valueBoolean";  // isvip, issubscriber -> extension[N].valueBoolean
   } else {
     valType = "valueString";   // updateid, lastupdate -> extension[N].valueString
   }
   ```
2. **Deterministic Contract Expansion:**
   14 new rules are appended to the `MappingConfig`, bringing total rules from 14 to 28 ($100\%$ coverage).
3. **Schema Sanitization:**
   In `app/mapping/engine.py`, `_sanitize_extensions()` ensures each extension receives an official URI (e.g. `http://hospital.smarthealth.org/extension/field-N`), coercing booleans (`"Y"` $\rightarrow$ `true`) and decimals (`"65000"` $\rightarrow$ `65000.0`).
4. **Three-Perspective Audit Lineage:**
   In the Forensic Auditor's Dynamic Reconciliation Matrix, every single column transitions from "Omitted" to `PRESERVED` under Perspective 3 (Target Medplum Persisted).

---

## 6. Configurable Modes: 100% Auto-Mapping Out of the Box

For enterprise deployments requiring **100% Zero Data Loss by default**, the platform can be configured to eliminate the manual button click entirely:

### Mode A: Full Preservation Mode (100% Auto-Mapping Default)
- When enabled, `app/mapping/suggest.py` instructs Gemini:
  > *"Map all standard clinical fields to standard FHIR paths, and automatically map ALL remaining proprietary or database columns to typed FHIR extensions (`extension[n].valueString`, `valueBoolean`, `valueDecimal`). Guarantee 100% field coverage."*
- Schema synthesis immediately yields **28/28 (100% Field Coverage)** on Turn 1.

### Mode B: Lean Clinical Mode (Current Default)
- AI Architect synthesizes only universal clinical attributes (14 fields).
- Operator retains explicit control via the `✨ Map All Remaining Columns as Extensions` button.

---

## 7. Related Documentation

- [Master Architecture Specification](architecture.md)
- [HL7 FHIR Extensibility & Zero-Data-Loss Architectural Strategy](fhir-extensibility-and-zero-data-loss.md)
- [HTTP 429 Rate Limiting & Throttling Strategy](http-429-rate-limiting-and-throttling.md)
- [Autonomous Multi-Agent System Architecture & Agent Roster](multi-agent-system-architecture.md)
- [Excel Support Architecture & Serial Date Quarantine Remediation Plan](excel-support-plan.md)

