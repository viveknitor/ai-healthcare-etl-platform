from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import get_settings
from .connectors.hapi import HapiClient
from .connectors.medplum import MedplumClient
from .mapping.engine import MappingNotApproved, apply_mapping
from .mapping.heal import heal_mapping_config
from .mapping.models import MappingConfig
from .mapping.storage import list_mappings, load_mapping, save_mapping
from .mapping.suggest import SuggestError, suggest_mapping
from .pipeline import generate_dynamic_reconciliation, run_hapi_to_medplum
from .upload_pipeline import ingest_uploaded_records, parse_uploaded_file
from .validation import validate_fhir

app = FastAPI(title="Healthcare ETL")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"],
                   allow_methods=["*"], allow_headers=["*"])


class PipelineRequest(BaseModel):
    resource_type: str = "Patient"
    count: int = 10
    offset: int = 0
    dry_run: bool = True  # safe default: nothing is written unless you ask


class SuggestRequest(BaseModel):
    sample: dict
    target_resource: str = "Patient"


class HealRequest(BaseModel):
    mapping: MappingConfig
    sample: dict
    errors: list[str]


class TransformRequest(BaseModel):
    mapping: MappingConfig
    payload: dict


class UploadExecuteRequest(BaseModel):
    rows: list[dict]
    mapping: MappingConfig
    dry_run: bool = True
    dataset_name: str = "upload"


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/pipelines/hapi-to-medplum")
def hapi_to_medplum(req: PipelineRequest):
    s = get_settings()
    medplum = None if req.dry_run else MedplumClient(s.medplum_base_url, s.medplum_client_id, s.medplum_client_secret)
    return run_hapi_to_medplum(
        HapiClient(s.hapi_base_url),
        medplum,
        resource_type=req.resource_type,
        count=req.count,
        offset=req.offset,
        dry_run=req.dry_run,
    ).to_dict()


@app.post("/mappings/suggest")
def suggest(req: SuggestRequest):
    s = get_settings()
    try:
        return suggest_mapping(req.sample, req.target_resource, api_key=s.gemini_api_key, model=s.gemini_model)
    except SuggestError as e:
        raise HTTPException(422, str(e))


@app.post("/mappings/auto-heal")
def auto_heal_endpoint(req: HealRequest):
    s = get_settings()
    try:
        healed_cfg, changes = heal_mapping_config(
            req.mapping,
            req.sample,
            req.errors,
            api_key=s.gemini_api_key,
            model=s.gemini_model,
        )
        return {
            "ok": True,
            "mapping": healed_cfg,
            "changes": changes,
            "metadata": healed_cfg.metadata,
        }
    except SuggestError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(500, f"AI Self-Healing failed: {e}")


@app.get("/medplum/live/{resource_type}/{resource_id}")
def get_live_medplum_resource(resource_type: str, resource_id: str):
    s = get_settings()
    try:
        medplum = MedplumClient(s.medplum_base_url, s.medplum_client_id, s.medplum_client_secret)
        res = medplum.client.get(
            f"{medplum.base_url}/fhir/R4/{resource_type}/{resource_id}",
            headers=medplum._auth_header()
        )
        if res.status_code == 200:
            data = res.json()
            return {
                "ok": True,
                "resource": data,
                "reconciliation": generate_dynamic_reconciliation(data, data, source_name="Medplum DB", target_name="Medplum DB"),
            }
        raise HTTPException(res.status_code, f"Medplum returned {res.status_code}: {res.text}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error communicating with Medplum: {e}")


@app.post("/transform")
def transform(req: TransformRequest):
    try:
        resource, errors = apply_mapping(req.mapping, req.payload)
    except MappingNotApproved as e:
        raise HTTPException(409, str(e))
    recon = generate_dynamic_reconciliation(req.payload, resource, source_name="Input Sample", target_name=req.mapping.target_resource)
    return {
        "resource": resource,
        "mapping_errors": errors,
        "validation_errors": validate_fhir(resource),
        "reconciliation_table": recon,
    }


@app.get("/mappings")
def get_all_mappings():
    return {"mappings": list_mappings()}


@app.post("/mappings/save")
def save_mapping_endpoint(mapping: MappingConfig):
    filename = save_mapping(mapping)
    return {"ok": True, "filename": filename, "mapping": mapping}


@app.post("/upload/parse")
async def upload_and_parse_file(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        rows = parse_uploaded_file(contents, file.filename or "data.csv")
        if not rows:
            raise HTTPException(400, "Could not extract any rows from the uploaded file.")
        return {
            "filename": file.filename,
            "total_rows": len(rows),
            "sample_rows": rows[:5],
            "all_rows": rows,
            "headers": list(rows[0].keys()),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error processing file: {e}")


@app.post("/upload/execute")
def execute_upload_ingestion(req: UploadExecuteRequest):
    s = get_settings()
    medplum = None if req.dry_run else MedplumClient(s.medplum_base_url, s.medplum_client_id, s.medplum_client_secret)
    return ingest_uploaded_records(
        medplum=medplum,
        rows=req.rows,
        mapping=req.mapping,
        dataset_name=req.dataset_name,
        dry_run=req.dry_run,
    )
