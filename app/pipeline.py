import copy
from dataclasses import asdict, dataclass, field

from .connectors.hapi import HapiClient
from .connectors.medplum import MedplumClient
from .logging_setup import get_logger
from .validation import validate_fhir

log = get_logger("pipeline")


@dataclass
class RecordResult:
    source_id: str | None
    status: str  # delivered | invalid | failed | dry_run
    errors: list[str] = field(default_factory=list)
    target_id: str | None = None


@dataclass
class RunReport:
    results: list[RecordResult] = field(default_factory=list)

    def summary(self) -> dict:
        counts: dict[str, int] = {}
        for r in self.results:
            counts[r.status] = counts.get(r.status, 0) + 1
        return {"total": len(self.results), "counts": counts}

    def to_dict(self) -> dict:
        return {"summary": self.summary(), "results": [asdict(r) for r in self.results]}


def normalize_for_target(resource: dict, source_system: str) -> tuple[dict, str, str]:
    """Strip server-assigned fields and stamp a source identifier so re-runs are idempotent.
    Returns (resource, identifier_system, identifier_value)."""
    res = copy.deepcopy(resource)
    src_id = res.pop("id", None)
    res.pop("meta", None)
    res.pop("text", None)  # server-generated narrative; may be stale after transformation
    system = f"urn:source:{source_system}"
    value = str(src_id)
    res.setdefault("identifier", []).append({"system": system, "value": value})
    return res, system, value


def run_hapi_to_medplum(hapi: HapiClient, medplum: MedplumClient | None, *, source_name: str = "hapi",
                        resource_type: str = "Patient", count: int = 10, dry_run: bool = False) -> RunReport:
    report = RunReport()
    for src in hapi.fetch(resource_type, count=count):
        sid = src.get("id")
        res, system, value = normalize_for_target(src, source_name)
        errors = validate_fhir(res)
        if errors:
            report.results.append(RecordResult(sid, "invalid", errors))
            log.warning("validation failed", extra={"ctx": {"source_id": sid, "errors": errors}})
            continue
        if dry_run or medplum is None:
            report.results.append(RecordResult(sid, "dry_run"))
            continue
        try:
            out = medplum.upsert(res, system, value)
            report.results.append(RecordResult(sid, "delivered", target_id=out.get("id")))
            log.info("delivered", extra={"ctx": {"source_id": sid, "target_id": out.get("id")}})
        except Exception as e:  # noqa: BLE001 - one bad record must not stop the batch
            report.results.append(RecordResult(sid, "failed", [str(e)]))
            log.error("delivery failed", extra={"ctx": {"source_id": sid, "error": str(e)}})
    return report
