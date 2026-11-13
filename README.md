# Healthcare ETL: HAPI FHIR -> Medplum (+ AI-assisted mapping)

Milestone 1 of the platform spec: fetch, normalize, validate, deliver, log, and a config-driven mapping engine.

## Run
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill Medplum client id/secret (Medplum app -> Project -> Clients)
export $(grep -v '^#' .env | xargs)
pytest -q
uvicorn app.main:app --reload
```
1. `POST /pipelines/hapi-to-medplum {"count": 5, "dry_run": true}`: fetch + validate only.
2. Same with `"dry_run": false`: upserts into Medplum (idempotent via a source identifier).
3. `POST /transform` with `mappings/member_to_patient.json` + a non-FHIR payload: JSON -> Patient.
4. `POST /mappings/suggest {"sample": {...}}`: LLM proposes a mapping (always `pending_review`).
   Review it, set `"status": "approved"`, then `/transform` will run it.

## Design (matches spec section 9)
- AI proposes, deterministic code executes: `mapping/suggest.py` never runs on data; `engine.py` refuses unapproved configs.
- Guardrails on the LLM: invalid JSON rejected, hallucinated source fields rejected, it cannot self-approve.
- Source and target connectors are independent (`connectors/`).
- One bad record never stops a batch; each gets a status and structured log line.

## Known gaps (next steps)
- Not yet run against live HAPI/Medplum (built and tested with mocked HTTP). First live run: use `dry_run: true`.
- Validation is structural + a few code bindings. For profile/terminology checks, call Medplum `POST /fhir/R4/{type}/$validate`.
- Patient only: cross-resource references (Encounter -> Patient) need an ID-remapping step after upsert.
- Phase 1 uses in-memory run reports; add PostgreSQL for run history, mapping versions, and audit trail.
- Mapping approval is a JSON field; add a real review UI/endpoint with approver identity.
- No PHI-grade security yet (authN on the API, secrets manager, encryption, access logs). Use synthetic data only until done.

## UI (React + Vite)
```bash
cd ui && npm install && npm run dev   # http://localhost:5173, proxies /api -> http://localhost:8000
```
- **Pipeline** tab: choose record count, dry run or live, see per-record status/errors.
- **Mapping studio** tab: paste a sample, get AI suggestions, edit/remove rules, approve, test on the sample.
Set `VITE_API_BASE` if the API runs elsewhere.
