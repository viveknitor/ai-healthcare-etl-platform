import asyncio
import json
import time
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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
from .telemetry import telemetry
from .upload_pipeline import ingest_uploaded_records, parse_uploaded_file, stream_uploaded_records
from .validation import validate_fhir

app = FastAPI(title="Healthcare ETL")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"],
                   allow_methods=["*"], allow_headers=["*"])

_INFRA_CACHE: dict = {"expires_at": 0.0, "payload": None}


def _extract_port(url: str, default_http: int = 80, default_https: int = 443) -> int:
    parsed = urlparse(url)
    if parsed.port:
        return parsed.port
    return default_https if parsed.scheme == "https" else default_http


async def _probe_medplum(client: httpx.AsyncClient, medplum_url: str, oauth_configured: bool) -> dict:
    port = _extract_port(medplum_url, 8103, 443)
    t0 = time.perf_counter()
    try:
        r = await client.get(f"{medplum_url}/healthcheck")
        latency_ms = round((time.perf_counter() - t0) * 1000, 1)
        body = r.json() if r.status_code == 200 else {}
        ok = r.status_code == 200 and bool(body.get("ok", True))
        return {
            "status": "ok" if ok else "degraded",
            "port": port,
            "url": medplum_url,
            "version": body.get("version", "FHIR R4"),
            "postgres": body.get("postgres"),
            "redis": body.get("redis"),
            "oauth_configured": oauth_configured,
            "latency_ms": latency_ms,
        }
    except Exception:
        return {
            "status": "offline",
            "port": port,
            "url": medplum_url,
            "version": "FHIR R4",
            "postgres": None,
            "redis": None,
            "oauth_configured": oauth_configured,
            "latency_ms": None,
        }


async def _probe_hapi(client: httpx.AsyncClient, hapi_url: str) -> dict:
    port = _extract_port(hapi_url, 80, 443)
    t0 = time.perf_counter()
    try:
        r = await client.get(
            f"{hapi_url}/metadata?_summary=true",
            headers={"Accept": "application/fhir+json"},
        )
        latency_ms = round((time.perf_counter() - t0) * 1000, 1)
        body = r.json() if r.status_code == 200 else {}
        ok = r.status_code == 200 and body.get("resourceType") == "CapabilityStatement"
        return {
            "status": "ok" if ok else "offline",
            "port": port,
            "url": hapi_url,
            "fhir_version": body.get("fhirVersion", "R4"),
            "latency_ms": latency_ms,
        }
    except Exception:
        return {
            "status": "offline",
            "port": port,
            "url": hapi_url,
            "fhir_version": "R4",
            "latency_ms": None,
        }


def _record_llm_from_config(cfg: MappingConfig, fallback_model: str) -> None:
    m = (cfg.metadata or {}).get("llm_metrics", {})
    if m:
        telemetry.record_llm_usage(
            tokens=m.get("total_tokens", 0),
            cost_usd=m.get("cost_usd", 0.0),
            model=m.get("model", fallback_model),
        )


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


@app.get("/stats/overview")
def get_dashboard_overview():
    return telemetry.get_summary()


@app.get("/stats/infrastructure")
@app.get("/health/services")
async def get_infrastructure_health(refresh: bool = False):
    now = time.monotonic()
    if not refresh and _INFRA_CACHE["payload"] and now < _INFRA_CACHE["expires_at"]:
        return _INFRA_CACHE["payload"]

    s = get_settings()
    medplum_url = s.medplum_base_url.rstrip("/")
    hapi_url = s.hapi_base_url.rstrip("/")
    oauth_configured = bool(s.medplum_client_id and s.medplum_client_secret)

    async with httpx.AsyncClient(timeout=2.0) as client:
        medplum_info, hapi_info = await asyncio.gather(
            _probe_medplum(client, medplum_url, oauth_configured),
            _probe_hapi(client, hapi_url),
        )

    summary = telemetry.get_summary()
    payload = {
        "medplum": medplum_info,
        "hapi": hapi_info,
        "fastapi": {
            "status": "ok",
            "port": 8000,
            "url": "http://localhost:8000",
            "uptime_sec": round(time.time() - telemetry.started_at, 1),
            "total_runs": summary["total_runs"],
        },
        "gemini": {
            "status": "active" if s.gemini_api_key else "missing_key",
            "model": s.gemini_model,
            "avg_cost_formatted": summary["avg_llm_cost_formatted"],
            "llm_calls": summary["llm_calls"],
        },
    }
    _INFRA_CACHE["payload"] = payload
    _INFRA_CACHE["expires_at"] = now + 15.0
    return payload


@app.post("/stats/reset")
def reset_telemetry():
    _INFRA_CACHE["expires_at"] = 0.0
    return {"ok": True, "summary": telemetry.reset()}


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
        cfg = suggest_mapping(req.sample, req.target_resource, api_key=s.gemini_api_key, model=s.gemini_model)
        _record_llm_from_config(cfg, s.gemini_model)
        return cfg
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
        telemetry.record_heal(len(changes) if changes else 1)
        _record_llm_from_config(healed_cfg, s.gemini_model)
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
    recon = generate_dynamic_reconciliation(
        req.payload,
        resource,
        source_name="Input Sample",
        target_name=req.mapping.target_resource,
        mapping=req.mapping,
    )
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


@app.post("/upload/execute-stream")
def execute_upload_stream(req: UploadExecuteRequest):
    s = get_settings()
    medplum = None if req.dry_run else MedplumClient(s.medplum_base_url, s.medplum_client_id, s.medplum_client_secret)

    def event_generator():
        for event in stream_uploaded_records(
            medplum=medplum,
            rows=req.rows,
            mapping=req.mapping,
            dataset_name=req.dataset_name,
            dry_run=req.dry_run,
        ):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
