# Healthcare ETL Platform: HAPI FHIR → Medplum (+ Gemini AI Mapping)

A healthcare data-integration and ETL platform that extracts clinical resources from HAPI FHIR, sanitizes and validates them, remaps cross-resource dependencies, and reconciles them into Medplum with dual-layer deduplication and idempotent conditional upserts. Includes an interactive React UI and a Google Gemini-powered AI Schema Mapping Studio.

---

## 📚 Documentation Directory

Detailed documentation is available in the [`docs/`](docs/) directory:
- 🏛️ **[Technical Architecture (`docs/architecture.md`)](docs/architecture.md)**: System design, data flow diagrams, multi-agent hybrid CRE architecture, cross-resource referential integrity, and idempotency specifications.
- 📖 **[Operations & User Guide (`docs/user-guide.md`)](docs/user-guide.md)**: Step-by-step instructions for running local Medplum, acquiring OAuth2 credentials, setting up `.env`, running commands, and operating the platform.

---

## ⚡ Quick Start

### 1. Prerequisites & Services
Ensure Docker Desktop is running. Start the local Medplum stack:
```powershell
cd Medplum
docker compose -f docker-compose.full-stack.yml up -d
```
- Medplum Web App: http://localhost:3000
- Medplum FHIR API: http://localhost:8103

### 2. Configure Environment (`.env`)
Create an admin account at http://localhost:3000/register, go to **Project Admin** → **Clients** → **Create Client**, and copy your credentials into `.env`:
```env
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.5-flash

HAPI_BASE_URL=https://hapi.fhir.org/baseR4
MEDPLUM_BASE_URL=http://localhost:8103
MEDPLUM_CLIENT_ID=your-medplum-client-id
MEDPLUM_CLIENT_SECRET=your-medplum-client-secret
```

### 3. Run Backend & Frontend
```powershell
# Terminal 1: Backend API
uvicorn app.main:app --reload

# Terminal 2: Web Frontend
cd ui
npm run dev
```
Open **http://localhost:5173** in your browser.

---

## 🔬 Core Capabilities

1. **Multi-Resource Ingestion:** Supports `Patient`, `Observation`, `Condition`, and `Encounter`.
2. **Referential Integrity:** Automatically remaps relative foreign keys (e.g. `Patient/123`) to conditional references (`Patient?identifier=urn:source:hapi|123`) and auto-ingests missing parent patients on the fly.
3. **Dual-Layer Deduplication:** In-batch tracking + Medplum conditional updates ensure re-running the same data updates in-place with **zero duplicates**.
4. **AI Schema Mapping Studio:** Uses Google Gemini (`gemini-3.5-flash`) to analyze non-FHIR source JSON and propose FHIR transformation rules under human review.
5. **UI State Persistence:** All derivation results persist in browser `localStorage` across page refreshes until explicitly cleared.

---

## 🧪 Testing
```powershell
pytest
```
All 11 unit tests cover pipeline paging, reference remapping, schema validation, isolated failure handling, and Gemini AI agent guardrails.
