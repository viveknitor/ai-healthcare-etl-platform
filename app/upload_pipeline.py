import csv
import io
import json
from dataclasses import asdict

from .connectors.medplum import MedplumClient
from .logging_setup import get_logger
from .mapping.engine import apply_mapping
from .mapping.models import MappingConfig
from .pipeline import RecordResult, extract_clinical_summary, generate_dynamic_reconciliation
from .validation import validate_fhir

log = get_logger("upload_pipeline")


def parse_uploaded_file(content: str | bytes, filename: str) -> list[dict]:
    """Parses an uploaded CSV, TSV, or JSON file into a list of row dictionaries."""
    if isinstance(content, bytes):
        text = content.decode("utf-8-sig", errors="replace")
    else:
        text = content

    text = text.strip()
    if not text:
        return []

    lower_name = filename.lower()

    # 1. JSON parsing
    if lower_name.endswith(".json") or text.startswith("[") or text.startswith("{"):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [r for r in parsed if isinstance(r, dict)]
            if isinstance(parsed, dict):
                return [parsed]
        except Exception:
            # Fallback for newline-delimited JSON
            rows = []
            for line in text.splitlines():
                line = line.strip()
                if line:
                    try:
                        obj = json.loads(line)
                        if isinstance(obj, dict):
                            rows.append(obj)
                    except Exception:
                        pass
            if rows:
                return rows

    # 2. CSV / TSV parsing
    delimiter = "\t" if ("\t" in text.splitlines()[0] or lower_name.endswith(".tsv")) else ","
    if delimiter == "," and ";" in text.splitlines()[0] and "," not in text.splitlines()[0]:
        delimiter = ";"

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    rows = []
    for r in reader:
        # Strip whitespace from keys and values
        clean_row = {}
        for k, v in r.items():
            if k is not None:
                clean_k = k.strip()
                clean_v = v.strip() if isinstance(v, str) else v
                clean_row[clean_k] = clean_v
        if clean_row:
            rows.append(clean_row)

    return rows


def ingest_uploaded_records(
    medplum: MedplumClient | None,
    rows: list[dict],
    mapping: MappingConfig,
    dataset_name: str = "upload",
    dry_run: bool = True,
) -> dict:
    """Transforms and ingests rows into FHIR resources via an approved mapping,
    delivering directly to Medplum with dynamic reconciliation tracking."""
    results: list[RecordResult] = []
    system = f"urn:source:{dataset_name.lower().replace(' ', '-')}"

    for i, row in enumerate(rows):
        source_id = (
            str(row.get("memid") or row.get("member_id") or row.get("id") or row.get("entityid") or f"row-{i+1}")
        )

        try:
            resource, mapping_errs = apply_mapping(mapping, row)
        except Exception as e:
            results.append(
                RecordResult(
                    source_id=source_id,
                    status="failed",
                    errors=[f"Mapping execution failed: {e}"],
                    source_record=row,
                    target_record={},
                )
            )
            continue

        if mapping_errs:
            results.append(
                RecordResult(
                    source_id=source_id,
                    status="invalid",
                    errors=mapping_errs,
                    source_record=row,
                    target_record=resource,
                )
            )
            continue

        # Validate against official FHIR R4 schema
        val_errors = validate_fhir(resource)
        if val_errors:
            results.append(
                RecordResult(
                    source_id=source_id,
                    status="invalid",
                    errors=val_errors,
                    source_record=row,
                    target_record=resource,
                )
            )
            continue

        summary = extract_clinical_summary(resource)

        # Ensure identifier exists for idempotent conditional upsert
        identifiers = resource.setdefault("identifier", [])
        has_source_id = any(isinstance(id_obj, dict) and id_obj.get("system") == system for id_obj in identifiers)
        if not has_source_id:
            identifiers.append({"system": system, "value": source_id})

        # Strip client-side transient id or meta
        resource.pop("id", None)
        resource.pop("meta", None)

        details = {
            "source_system": dataset_name,
            "source_id": source_id,
            "target_system": "Medplum (FHIR R4)",
            "target_resource": mapping.target_resource,
            "idempotent_identifier": f"{system}|{source_id}",
            "conditional_query": f"?identifier={system}|{source_id}",
            "mapping_name": mapping.name,
        }

        recon_pre = generate_dynamic_reconciliation(row, resource, source_name=dataset_name, target_name="Medplum")

        if dry_run or medplum is None:
            results.append(
                RecordResult(
                    source_id=source_id,
                    status="dry_run",
                    patient_summary=summary,
                    mapping_details=details,
                    reconciliation_table=recon_pre,
                    source_record=row,
                    target_record=resource,
                )
            )
            continue

        try:
            out = medplum.upsert(resource, system, source_id)
            is_created = out.get("_is_created", False)
            details["delivery_action"] = "created" if is_created else "updated"
            recon_post = generate_dynamic_reconciliation(row, out, source_name=dataset_name, target_name="Medplum")
            results.append(
                RecordResult(
                    source_id=source_id,
                    status="delivered",
                    target_id=out.get("id"),
                    patient_summary=summary,
                    mapping_details=details,
                    reconciliation_table=recon_post,
                    source_record=row,
                    target_record=out,
                )
            )
            log.info("Uploaded record delivered", extra={"ctx": {"id": out.get("id")}})
        except Exception as e:
            results.append(
                RecordResult(
                    source_id=source_id,
                    status="failed",
                    errors=[str(e)],
                    patient_summary=summary,
                    mapping_details=details,
                    reconciliation_table=recon_pre,
                    source_record=row,
                    target_record=resource,
                )
            )

    counts: dict[str, int] = {}
    for r in results:
        counts[r.status] = counts.get(r.status, 0) + 1

    return {
        "summary": {"total": len(results), "counts": counts},
        "results": [asdict(r) for r in results],
    }

