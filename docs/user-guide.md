# Operations & User Guide: Healthcare ETL & Interoperability Platform

This guide provides step-by-step instructions for starting, configuring, and operating the Healthcare ETL & Interoperability Platform, including local Medplum Docker setup, OAuth2 credentials, multi-agent pipeline execution, direct file ingestion (QNEXT), AI mapping synthesis, and closed-loop self-healing.

---

## 1. Prerequisites

Ensure your host system has the following installed:
- **Docker Desktop** (running and active)
- **Python 3.11+**
- **Node.js v18+ & npm**

---

## 2. Step-by-Step Setup

### Step 1: Start the Local Medplum Stack

Medplum runs locally via Docker Compose inside the `Medplum` directory:

```powershell
# Navigate to the Medplum directory
cd E:\ai-healthcare-etl-platform\ai-healthcare-etl-platform\Medplum

# Start the full stack (PostgreSQL, Redis/Valkey, Server, Web App) in background
docker compose -f docker-compose.full-stack.yml up -d
```

#### Verify Containers are Running:
Run `docker ps`. You should see 4 active containers:
- `medplum-medplum-app-1`: Web Console on **`http://localhost:3000`**
- `medplum-medplum-server-1`: FHIR API on **`http://localhost:8103`**
- `medplum-postgres-1`: Database on port `5434`
- `medplum-redis-1`: Cache on port `6380`

---

### Step 2: Create Your Medplum Account & Project

1. Open your web browser and go to:
   👉 **[http://localhost:3000/register](http://localhost:3000/register)**
2. Fill out the registration form:
   - **First Name & Last Name:** (e.g. `Admin User`)
   - **Project Name:** (e.g. `Healthcare-ETL`)
   - **Email:** (e.g. `admin@example.com`)
   - **Password:** (create a secure password)
3. Click **Create Account** / **Register**.

---

### Step 3: Generate Client ID and Secret in Medplum

1. In the Medplum left navigation sidebar, click on **Project Admin** (gear icon).
2. Click **Clients** (or navigate to `http://localhost:3000/admin/clients`).
3. Click **Create Client**.
4. Set the name to **`Healthcare-ETL`** and click **Save**.
5. Medplum will display a dialog with your credentials:
   - **Client ID:** (UUID string, e.g. `9f8b4c2a-1123-4e55-8901-abcdef123456`)
   - **Client Secret:** (long random token string)
6. **Copy both values immediately.** *(The secret is only shown once upon creation)*.

---

### Step 4: Configure Your `.env` File

Open `.env` in the root of the project (`E:\ai-healthcare-etl-platform\ai-healthcare-etl-platform\.env`) and configure:

```env
# Google Gemini API (AI Semantic Reasoning & Mapping Engine)
GEMINI_API_KEY=your-gemini-api-key-from-google-ai-studio
GEMINI_MODEL=gemini-2.5-flash

# Upstream Source Server (HAPI FHIR R4)
HAPI_BASE_URL=https://hapi.fhir.org/baseR4

# Destination Medplum Server (Local Docker)
MEDPLUM_BASE_URL=http://localhost:8103
MEDPLUM_CLIENT_ID=your-copied-client-id
MEDPLUM_CLIENT_SECRET=your-copied-client-secret
```

---

### Step 5: Start the Backend and Frontend

Open **two separate PowerShell terminals**:

#### Terminal 1 — Start the FastAPI Backend:
```powershell
cd E:\ai-healthcare-etl-platform\ai-healthcare-etl-platform
python -m uvicorn app.main:app --reload --port 8000
```
- Backend API: **`http://localhost:8000`**
- Interactive Swagger Docs: **`http://localhost:8000/docs`**

#### Terminal 2 — Start the React Web UI:
```powershell
cd E:\ai-healthcare-etl-platform\ai-healthcare-etl-platform\ui
npm run dev
```
- Web UI: **`http://localhost:5173`**

---

## 3. Platform Architecture & Navigation

The platform interface is organized into three primary operational modules:

```
[ 🔄 HAPI to Medplum Sync ]   [ 📁 Direct File Ingestion (QNEXT) ]   [ ✨ AI Mapping Studio ]
```

### Live Heartbeat Telemetry (Topbar):
- **`Medplum :8103`**: Live destination connection status.
- **`FastAPI Core Ready`**: Real-time backend API connectivity.
- **`Gemini 2.5 Flash`**: Cognitive AI semantic reasoning engine.

---

## 4. Operational Walkthroughs

### Module 1: HAPI to Medplum Sync (🔄)

Automated upstream FHIR R4 extraction, foreign-key dependency resolution, and idempotent conditional upserts.

1. **Select Target Resource**: Choose between `Patient`, `Observation`, `Condition`, or `Encounter`.
2. **Configure Batch & Offset**:
   - `Batch Size`: Number of records to process (1 to 100).
   - `Source Offset`: Paginate upstream HAPI records (e.g. Offset 0 $\rightarrow$ Records #1–10; Offset 10 $\rightarrow$ Records #11–20).
3. **Mandatory 2-Step Quality Gate**:
   - **Step 1 — `🛡️ Validate & Verify Schema`**: Runs full Pydantic schema validation and dependency resolution without writing to the database.
   - **Step 2 — `⚡ Deliver to Medplum`**: Unlocks only after successful validation. Persists batch with conditional upserts.
4. **Dynamic Delivery Feedback**:
   - Once records are committed, the button automatically updates to:
     $$\mathbf{✓\ Delivered\ All\ \{N\}\ to\ Medplum}$$
     with an emerald success glow.
5. **High-Density Data Grid & Search**:
   - Filter records by keyword using the search bar (`ID`, `Name`, `Codes`).
   - Filter by status tabs: `ALL`, `delivered`, `dry_run` (validated), `invalid`, `failed`.
   - Control pagination: 10, 15, 25, 50, or 100 rows per page with page jump buttons.
6. **3-Perspective Record Inspector**:
   - Click **`Inspect`** on any row to open:
     - **Perspective 1: 🔄 Dynamic Reconciliation Matrix**: Field-by-field source vs target diff with derivation tags (`Preserved`, `Transformed`, `Scoped ID`, `Remapped Ref`).
     - **Perspective 2: 🏥 Destination Storage Perspective**: Live FHIR database inspection directly from local Medplum.
     - **Perspective 3: 📄 Raw Payloads**: Side-by-side JSON comparison with one-click clipboard copy.

---

### Module 2: Direct File Ingestion (QNEXT / PlanData SQL Server) (📁)

Autonomous ingestion of non-FHIR tabular files (CSV, Excel `.xlsx`, TSV, or JSON) directly into Medplum.

1. **Upload Data File**:
   - Drag and drop or browse for arbitrary data files (`.csv`, `.xlsx`, `.tsv`, `.json`).
   - Or click **`⚡ Load Sample PlanData Table`** (90 clinical member rows).
2. **Autonomous Multi-Agent Relay**:
   - The platform visualizes the 7 specialized agents executing the ingestion pipeline:
     1. `🤖 DataScout`: Byte stream scanning, column parsing, and encoding normalization.
     2. `🧠 AI Architect`: Semantic reasoning over proprietary columns against HL7 FHIR R4.
     3. `👤 Compliance Officer`: Strict human-in-the-loop review and approval gate.
     4. `🛡️ Sentinel Validator`: Zero-tolerance Pydantic validation.
     5. `🩹 Self-Healer Sub-Agent (4B)`: Auto-repairs schema violations in closed loop if errors occur.
     6. `⚡ Dispatcher Agent`: Row-by-row transactional SSE streaming to Medplum PostgreSQL.
     7. `📊 Forensic Auditor`: End-to-end reconciliation certification and audit packaging.
3. **Interactive Agent Views**:
   - **Relay View**: Compact stepper with live status indicators.
   - **Agent Roster**: Full technical matrix of all agent inputs, outputs, and actions.
   - **Agent Dossier**: Click any agent or **Inspect 🔍** to view mission specs, tool access, and live telemetry.
   - **Sequential Live Run Feed**: Shows real-time task checklist, duration timers, auto-collapsing completed rows, and smooth auto-scroll.
4. **AI Closed-Loop Self-Healing**:
   - If any schema error occurs (e.g. camelCase mismatch `multiplebirthBoolean` $\rightarrow$ `multipleBirthBoolean` or enum mapping), an alert banner appears.
   - Click **`🩹 AI Auto-Heal Contract with Gemini`** to autonomously repair the contract, re-validate, and log audit changes.
5. **Real-Time Row-by-Row SSE Streaming**:
   - Live telemetry progress bar displays record count, percent complete, throughput speed (`rec/sec`), and ETA.
   - Optional **`⏹️ Stop Ingestion`** button allows graceful stream abortion.
6. **Downloadable Audit Reports**:
   - **`📥 Download Excel CSV`**: Generates a spreadsheet containing all 27+ original input columns merged with ETL status, Medplum target IDs, timestamps, and error logs (prefixed with UTF-8 BOM `\uFEFF` for native Microsoft Excel rendering).
   - **`💾 Download JSON`**: Full JSON audit package.

---

### Module 3: AI Schema Mapping Studio (✨)

Interactive sandbox for synthesizing and testing transformation rules on raw clinical JSON.

1. **Source Record Sample**: Paste sample JSON from an EHR or proprietary database.
2. **Suggest Mapping**: Click **`✨ Suggest Mapping`** to query Gemini 2.5 Flash for FHIR R4 paths, transforms, and confidence scores.
3. **Review & Human-in-the-Loop Gate**:
   - Review each proposed rule with confidence percentage and AI rationale.
   - Edit rules inline or delete invalid rules (edits automatically revert status to `pending_review`).
   - Click **`✓ Approve Mapping`** to clear the governance gate.
4. **Test on Sample**: Run deterministic transformation and inspect the resulting **Reconciliation Matrix** or **Raw FHIR JSON**.

---

## 5. Mapping Storage Standard

All generated and healed mapping contracts are standardized and persisted in the `mappings/` directory:
- **`mappings/patient_mapping.json`**: Active single mapping specification for the FHIR R4 Patient resource.
- Every save or auto-heal operation updates this single file deterministically, preventing orphan configuration drift.

---

## 6. Live Simulation Demo Mode

To test and demonstrate the sequential multi-agent live feed with simulated task checklist animations and compliance approval gates:

1. Open your browser to:
   👉 **`http://localhost:5173?demo=1`**
2. The Live Run feed will autonomously advance through agents:
   - Agent 1 (`DataScout`) checks off discovery tasks and completes.
   - Agent 2 (`AI Architect`) generates the schema contract.
   - Agent 3 (`Compliance Officer`) enters `waiting_human` status.
   - Click **`✓ Approve Contract`** to approve the contract and trigger downstream validation and streaming.

---

## 7. Operational Commands

### Run Automated Backend Test Suite (Pytest):
```powershell
cd E:\ai-healthcare-etl-platform\ai-healthcare-etl-platform
python -m pytest tests
```
*(All 25 automated tests verify validation, transformation, SSE streaming, storage, and self-healing)*.

### Build Frontend Production Assets (Vite):
```powershell
cd E:\ai-healthcare-etl-platform\ai-healthcare-etl-platform\ui
npm run build
```

### Stop Local Medplum Docker Stack:
```powershell
cd E:\ai-healthcare-etl-platform\ai-healthcare-etl-platform\Medplum
docker compose -f docker-compose.full-stack.yml stop
```

### Restart Local Medplum Docker Stack:
```powershell
cd E:\ai-healthcare-etl-platform\ai-healthcare-etl-platform\Medplum
docker compose -f docker-compose.full-stack.yml up -d
```
