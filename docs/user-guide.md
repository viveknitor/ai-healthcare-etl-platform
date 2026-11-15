failed
400: {"resourceType":"OperationOutcome","issue":[{"severity":"error","code":"invalid","details":{"text":"Conditional reference 'Encounter?identifier=urn:source:hapi|enc-fa7aa3029a9ba30e' did not match any resources"},"expression":["Observation.encounter"]}],"extension":[{"url":"https://medplum.com/fhir/S# Operations & User Guide: Healthcare ETL Platform

This guide provides step-by-step instructions for starting, configuring, and operating the Healthcare ETL Platform, including setting up local Medplum, acquiring OAuth2 credentials, and executing pipelines.

---

## 1. Prerequisites

Ensure your system has the following installed:
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

# Start the full stack (Postgres, Redis/Valkey, Server, Web App) in the background
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

1. In the Medplum left navigation sidebar, click on **Project Admin** (or the gear icon).
2. Click **Clients** (or navigate to `http://localhost:3000/admin/clients`).
3. Click **Create Client**.
4. Set the name to **`Healthcare-ETL`** and click **Save**.
5. Medplum will display a dialog with your credentials:
   - **Client ID:** (a UUID, e.g. `9f8b4c2a-1123-4e55-8901-abcdef123456`)
   - **Client Secret:** (a long random token string)
6. **Copy both values immediately.** *(The secret is only shown once upon creation)*.

---

### Step 4: Configure Your `.env` File

Open `.env` in the root of the project (`E:\ai-healthcare-etl-platform\ai-healthcare-etl-platform\.env`) and paste your credentials:

```env
# Google Gemini API (AI Schema Mapping Agent)
GEMINI_API_KEY=your-gemini-api-key-from-google-ai-studio
GEMINI_MODEL=gemini-3.5-flash

# Upstream Source Server
HAPI_BASE_URL=https://hapi.fhir.org/baseR4

# Destination Medplum Server (Local)
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
uvicorn app.main:app --reload
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

## 3. How to Use the Platform

Open **[http://localhost:5173](http://localhost:5173)** in your browser.

### Scenario A: Multi-Resource Ingestion (Pipeline Tab)

1. Select the **Target Resource Type** from the dropdown:
   - 👤 **`Patient`** (Demographics & Identity)
   - 🧪 **`Observation`** (Vitals, Lab tests, EKG studies)
   - 🩺 **`Condition`** (Diagnoses, Active health problems)
   - 🏥 **`Encounter`** (Clinical visits & admissions)
2. Choose your **Record Count** (e.g. `5` or `10`).
3. **Step 1 (Preview):** Click **`Preview (Dry Run)`** to view the source extraction and mapping derivation rules without writing to Medplum.
4. **Step 2 (Delivery):** Click **`Deliver to Medplum`** to execute the live conditional upsert.
5. **Inspect Dynamic Mapping & Extraction Matrix:**
   - Click **`Inspect`** on any row to open the 3-tab inspector:
     - **Tab 1: 🔄 Dynamic Reconciliation Table:** Field-by-field extraction comparing source payload vs target stored values, with derivation rules and status badges (`Preserved`, `Transformed`, `Scoped ID`, `Remapped Ref`, `Sanitized`).
     - **Tab 2: 🏥 Destination Storage Perspective:** View the resource from the target Medplum perspective. Click **`⚡ Verify Live from Destination DB`** to issue a live FHIR query to verify the persisted record state and version ID in real time.
     - **Tab 3: 📄 Raw JSON Payloads:** Side-by-side view with one-click copy buttons for source and target JSON.
6. **Persistence:** Refresh the browser—notice your table data persists until you click **`Clear Results`**.

---

### Scenario B: Fetching Consecutive Unique Records (No Duplicates)

To guarantee you never re-fetch the same records:
- Use the **`Next Batch →`** button or increment the **Source Offset**:
  - **Offset 0 (Count 5):** Patients #1 to #5
  - **Offset 5 (Count 5):** Patients #6 to #10
  - **Offset 10 (Count 5):** Patients #11 to #15

---

### Scenario C: Viewing Ingested Data in Medplum

1. **Direct Click:** Click the blue **Target Medplum ID** link in any table row (e.g. `baabd38a... ↗`).
2. **Medplum App Navigation:** Open **`http://localhost:3000`**:
   - For Patients: Click **`Patient`** in the Favorites sidebar or open **`http://localhost:3000/Patient`**.
   - For Observations: Type `Observation` in the *Resource Type* box or open **`http://localhost:3000/Observation`**.
   - For Conditions: Open **`http://localhost:3000/Condition`**.
3. **Patient Chart:** Click on a patient (e.g. *María Elena López*) and click the **Observations** tab to see all her linked clinical records.

---

### Scenario D: AI Schema Mapping Studio (Mapping Studio Tab)

For onboarding custom, non-FHIR JSON data from legacy hospital systems:
1. Navigate to the **Mapping studio** tab.
2. In box **1 (Source sample)**, paste your raw JSON record (or use the provided sample).
3. Select the target FHIR resource (e.g. `Patient`).
4. Click **Suggest mapping** — the Google Gemini agent analyzes the schema and proposes FHIR path mappings, code conversions (`M` → `male`), and confidence scores.
5. Review the proposed rules, modify if desired, and click **Approve**.
6. Click **Test transform** to execute the deterministic transform and validate the resulting FHIR payload.

---

## 4. Operational Management & Commands

### Running Unit Tests:
```powershell
cd E:\ai-healthcare-etl-platform\ai-healthcare-etl-platform
pytest
```

### Stopping Local Medplum:
```powershell
cd E:\ai-healthcare-etl-platform\ai-healthcare-etl-platform\Medplum
docker compose -f docker-compose.full-stack.yml stop
```

### Restarting Local Medplum:
```powershell
cd E:\ai-healthcare-etl-platform\ai-healthcare-etl-platform\Medplum
docker compose -f docker-compose.full-stack.yml up -d
```

