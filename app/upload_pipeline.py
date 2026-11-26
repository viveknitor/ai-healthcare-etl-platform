import csv
import io
import json
import time
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import asdict

from .connectors.medplum import MedplumClient
from .logging_setup import get_logger
from .mapping.engine import apply_mapping
from .mapping.models import MappingConfig
from .pipeline import RecordResult, extract_clinical_summary, generate_dynamic_reconciliation
from .telemetry import telemetry
from .validation import validate_fhir

log = get_logger("upload_pipeline")


def _parse_xlsx_bytes(data: bytes) -> list[dict]:
    """Parse a Microsoft Excel (.xlsx) workbook directly using pure standard library zipfile/XML."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            strings = []
            if "xl/sharedStrings.xml" in z.namelist():
                s_tree = ET.fromstring(z.read("xl/sharedStrings.xml"))
                ns = {"ns": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
                for si in s_tree.findall(".//ns:si", ns):
                    t = si.find(".//ns:t", ns)
                    strings.append(t.text if t is not None and t.text else "")

            sheet_xml = z.read("xl/worksheets/sheet1.xml")
            sheet_tree = ET.fromstring(sheet_xml)
            ns = {"ns": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

            rows = []
            for row in sheet_tree.findall(".//ns:row", ns):
                row_data = []
                for c in row.findall("./ns:c", ns):
                    t_attr = c.get("t")
                    v_el = c.find("./ns:v", ns)
                    val = v_el.text if v_el is not None else ""
                    if t_attr == "s" and val.isdigit():
                        val = strings[int(val)] if int(val) < len(strings) else val
                    row_data.append(val)
                if any(row_data):
                    rows.append(row_data)

            if not rows:
                return []
            headers = [str(h).strip() for h in rows[0]]
            dict_rows = []
            for r in rows[1:]:
                row_dict = {}
                for i, h in enumerate(headers):
                    if h:
                        row_dict[h] = r[i].strip() if i < len(r) and isinstance(r[i], str) else (r[i] if i < len(r) else "")
                if any(row_dict.values()):
                    dict_rows.append(row_dict)
            return dict_rows
    except Exception as e:
        log.warning(f"Excel parsing fallback: {e}")
        return []


def parse_uploaded_file(content: str | bytes, filename: str) -> list[dict]:
    """Parses an uploaded CSV, TSV, JSON, or Excel (.xlsx) file into a list of row dictionaries."""
    lower_name = filename.lower()

    # 1. Native Excel (.xlsx) parsing
    if lower_name.endswith(".xlsx"):
        raw_bytes = content if isinstance(content, bytes) else content.encode("latin-1")
        return _parse_xlsx_bytes(raw_bytes)

    if isinstance(content, bytes):
        text = content.decode("utf-8-sig", errors="replace")
    else:
        text = content

    text = text.strip()
    if not text:
        return []

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


def _process_single_record(
    i: int,
    row: dict,
    mapping: MappingConfig,
    medplum: MedplumClient | None,
    dataset_name: str,
    dry_run: bool,
    system: str,
) -> RecordResult:
    """Transforms, validates, and optionally persists a single record."""
    source_id = str(row.get("memid") or row.get("member_id") or row.get("id") or row.get("entityid") or f"row-{i+1}")

    try:
        resource, mapping_errs = apply_mapping(mapping, row)
    except Exception as e:
        return RecordResult(
            source_id=source_id,
            status="failed",
            errors=[f"Mapping execution failed: {e}"],
            source_record=row,
            target_record={},
            mapping_details={
                "delivery_action": "quarantined",
                "error_category": "transform_execution",
                "source_system": dataset_name,
                "source_id": source_id,
                "target_system": "Medplum (FHIR R4)",
                "target_resource": mapping.target_resource,
            },
        )

    if mapping_errs:
        recon_err = generate_dynamic_reconciliation(row, resource, source_name=dataset_name, target_name="Medplum", mapping=mapping)
        return RecordResult(
            source_id=source_id,
            status="invalid",
            errors=mapping_errs,
            source_record=row,
            target_record=resource,
            reconciliation_table=recon_err,
            patient_summary=extract_clinical_summary(resource),
            mapping_details={
                "delivery_action": "quarantined",
                "error_category": "transform_syntax",
                "source_system": dataset_name,
                "source_id": source_id,
                "target_system": "Medplum (FHIR R4)",
                "target_resource": mapping.target_resource,
            },
        )

    # Validate against official FHIR R4 schema
    val_errors = validate_fhir(resource)
    if val_errors:
        recon_err = generate_dynamic_reconciliation(row, resource, source_name=dataset_name, target_name="Medplum", mapping=mapping)
        return RecordResult(
            source_id=source_id,
            status="invalid",
            errors=val_errors,
            source_record=row,
            target_record=resource,
            reconciliation_table=recon_err,
            patient_summary=extract_clinical_summary(resource),
            mapping_details={
                "delivery_action": "quarantined",
                "error_category": "schema_validation",
                "source_system": dataset_name,
                "source_id": source_id,
                "target_system": "Medplum (FHIR R4)",
                "target_resource": mapping.target_resource,
            },
        )

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

    recon_pre = generate_dynamic_reconciliation(row, resource, source_name=dataset_name, target_name="Medplum", mapping=mapping)

    if dry_run or medplum is None:
        details["delivery_action"] = "validated"
        return RecordResult(
            source_id=source_id,
            status="dry_run",
            patient_summary=summary,
            mapping_details=details,
            reconciliation_table=recon_pre,
            source_record=row,
            target_record=resource,
        )

    try:
        out = medplum.upsert(resource, system, source_id)
        is_created = out.get("_is_created", False)
        details["delivery_action"] = "created" if is_created else "updated"
        recon_post = generate_dynamic_reconciliation(row, out, source_name=dataset_name, target_name="Medplum", mapping=mapping)
        log.info("Uploaded record delivered", extra={"ctx": {"id": out.get("id"), "action": details["delivery_action"]}})
        return RecordResult(
            source_id=source_id,
            status="delivered",
            target_id=out.get("id"),
            patient_summary=summary,
            mapping_details=details,
            reconciliation_table=recon_post,
            source_record=row,
            target_record=out,
        )
    except Exception as e:
        details["delivery_action"] = "failed"
        details["error_category"] = "network_api"
        return RecordResult(
            source_id=source_id,
            status="failed",
            errors=[str(e)],
            patient_summary=summary,
            mapping_details=details,
            reconciliation_table=recon_pre,
            source_record=row,
            target_record=resource,
        )


def _record_upload_telemetry(
    counts: dict[str, int],
    total: int,
    dry_run: bool,
    medplum: MedplumClient | None,
    t_start: float,
    source: str,
) -> None:
    if total <= 0:
        return
    elapsed = max(0.001, time.perf_counter() - t_start)
    telemetry.record_run(
        total=total,
        valid=counts.get("delivered", 0) + counts.get("dry_run", 0),
        invalid=counts.get("invalid", 0) + counts.get("failed", 0),
        delivered=counts.get("delivered", 0),
        dry_run=dry_run or medplum is None,
        duration_sec=elapsed,
        source=source,
    )


def ingest_uploaded_records(
    medplum: MedplumClient | None,
    rows: list[dict],
    mapping: MappingConfig,
    dataset_name: str = "upload",
    dry_run: bool = True,
    pacing_delay_ms: float = 12.0,
) -> dict:
    """Transforms and ingests rows into FHIR resources via an approved mapping,
    delivering directly to Medplum with dynamic reconciliation tracking and adaptive pacing."""
    t_start = time.perf_counter()
    system = f"urn:source:{dataset_name.lower().replace(' ', '-')}"
    results: list[RecordResult] = []
    should_pace = (not dry_run) and (medplum is not None) and (len(rows) > 200) and (pacing_delay_ms > 0)

    for i, row in enumerate(rows):
        res = _process_single_record(i, row, mapping, medplum, dataset_name, dry_run, system)
        results.append(res)
        if should_pace and i < len(rows) - 1:
            time.sleep(pacing_delay_ms / 1000.0)

    counts: dict[str, int] = {}
    created_count = 0
    updated_count = 0
    for r in results:
        counts[r.status] = counts.get(r.status, 0) + 1
        act = (r.mapping_details or {}).get("delivery_action")
        if act == "created":
            created_count += 1
        elif act == "updated":
            updated_count += 1
    counts["created"] = created_count
    counts["updated"] = updated_count

    _record_upload_telemetry(counts, len(results), dry_run, medplum, t_start, f"upload:{dataset_name}")

    return {
        "summary": {"total": len(results), "counts": counts},
        "results": [asdict(r) for r in results],
    }


def stream_uploaded_records(
    medplum: MedplumClient | None,
    rows: list[dict],
    mapping: MappingConfig,
    dataset_name: str = "upload",
    dry_run: bool = True,
    pacing_delay_ms: float = 12.0,
):
    """Yields progress events row-by-row via Server-Sent Events (SSE) with adaptive micro-pacing for large batches."""
    t_start = time.perf_counter()
    system = f"urn:source:{dataset_name.lower().replace(' ', '-')}"
    counts = {"delivered": 0, "dry_run": 0, "invalid": 0, "failed": 0, "created": 0, "updated": 0}
    should_pace = (not dry_run) and (medplum is not None) and (len(rows) > 200) and (pacing_delay_ms > 0)
    processed = 0

    try:
        for i, row in enumerate(rows):
            res = _process_single_record(i, row, mapping, medplum, dataset_name, dry_run, system)
            processed += 1
            counts[res.status] = counts.get(res.status, 0) + 1
            act = (res.mapping_details or {}).get("delivery_action")
            if act == "created":
                counts["created"] = counts.get("created", 0) + 1
            elif act == "updated":
                counts["updated"] = counts.get("updated", 0) + 1

            yield {
                "type": "record",
                "index": i + 1,
                "total": len(rows),
                "result": asdict(res),
                "current_counts": dict(counts),
            }

            if should_pace and i < len(rows) - 1:
                time.sleep(pacing_delay_ms / 1000.0)

        yield {
            "type": "complete",
            "summary": {
                "total": len(rows),
                "counts": dict(counts),
            },
        }
    finally:
        _record_upload_telemetry(counts, processed, dry_run, medplum, t_start, f"stream:{dataset_name}")

