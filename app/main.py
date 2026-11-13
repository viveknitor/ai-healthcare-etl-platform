from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import get_settings
from .connectors.hapi import HapiClient
from .connectors.medplum import MedplumClient
from .mapping.engine import MappingNotApproved, apply_mapping
from .mapping.models import MappingConfig
from .mapping.suggest import SuggestError, suggest_mapping
from .pipeline import run_hapi_to_medplum
from .validation import validate_fhir

app = FastAPI(title="Healthcare ETL")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"],
                   allow_methods=["*"], allow_headers=["*"])


class PipelineRequest(BaseModel):
    count: int = 10
    dry_run: bool = True  # safe default: nothing is written unless you ask


class SuggestRequest(BaseModel):
    sample: dict
    target_resource: str = "Patient"


class TransformRequest(BaseModel):
    mapping: MappingConfig
    payload: dict


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/pipelines/hapi-to-medplum")
def hapi_to_medplum(req: PipelineRequest):
    s = get_settings()
    medplum = None if req.dry_run else MedplumClient(s.medplum_base_url, s.medplum_client_id, s.medplum_client_secret)
    return run_hapi_to_medplum(HapiClient(s.hapi_base_url), medplum, count=req.count, dry_run=req.dry_run).to_dict()


@app.post("/mappings/suggest")
def suggest(req: SuggestRequest):
    s = get_settings()
    try:
        return suggest_mapping(req.sample, req.target_resource, api_key=s.gemini_api_key, model=s.gemini_model)
    except SuggestError as e:
        raise HTTPException(422, str(e))


@app.post("/transform")
def transform(req: TransformRequest):
    try:
        resource, errors = apply_mapping(req.mapping, req.payload)
    except MappingNotApproved as e:
        raise HTTPException(409, str(e))
    return {"resource": resource, "mapping_errors": errors, "validation_errors": validate_fhir(resource)}
