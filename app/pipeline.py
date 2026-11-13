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
    patient_summary: dict = field(default_factory=dict)
    mapping_details: dict = field(default_factory=dict)
    source_record: dict = field(default_factory=dict)
    target_record: dict = field(default_factory=dict)


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


def extract_clinical_summary(resource: dict) -> dict:
    rt = resource.get("resourceType", "Unknown")
    summary = {
        "resource_type": rt,
        "title": "Unknown",
        "subtitle": "—",
        "badge": rt,
        "primary_value": "—",
        "secondary_value": "—",
        "subject_reference": "—",
        "display_name": "Unknown",
        "gender": "—",
        "birth_date": "—",
        "telecom": "—",
        "address": "—",
    }

    # Extract subject or patient reference if present
    subj = resource.get("subject") or resource.get("patient")
    if isinstance(subj, dict):
        summary["subject_reference"] = subj.get("display") or subj.get("reference") or "—"

    if rt == "Patient":
        names = resource.get("name", [])
        display_name = "Unknown"
        family = ""
        given = ""
        if names and isinstance(names, list) and isinstance(names[0], dict):
            n = names[0]
            given = " ".join(n.get("given", [])) if isinstance(n.get("given"), list) else str(n.get("given", ""))
            family = str(n.get("family", ""))
            display_name = f"{given} {family}".strip() or "Unknown"
        telecoms = [t.get("value") for t in resource.get("telecom", []) if isinstance(t, dict) and t.get("value")]
        addr = ""
        if resource.get("address") and isinstance(resource["address"], list) and isinstance(resource["address"][0], dict):
            lines = resource["address"][0].get("line", [])
            city = resource["address"][0].get("city", "")
            state = resource["address"][0].get("state", "")
            addr = ", ".join(filter(None, [", ".join(lines) if isinstance(lines, list) else str(lines), city, state]))
        summary.update({
            "title": display_name,
            "display_name": display_name,
            "given_name": given,
            "family_name": family,
            "subtitle": f"Gender: {resource.get('gender', 'unknown')} | DOB: {resource.get('birthDate', '—')}",
            "gender": resource.get("gender", "unknown"),
            "birth_date": resource.get("birthDate", "—"),
            "primary_value": resource.get("gender", "unknown"),
            "secondary_value": resource.get("birthDate", "—"),
            "telecom": telecoms[0] if telecoms else "—",
            "address": addr or "—",
        })

    elif rt == "Observation":
        code_obj = resource.get("code", {})
        test_name = code_obj.get("text")
        if not test_name and code_obj.get("coding"):
            test_name = code_obj["coding"][0].get("display") or code_obj["coding"][0].get("code")
        test_name = test_name or "Observation"

        val_str = "—"
        if "valueQuantity" in resource:
            vq = resource["valueQuantity"]
            val_str = f"{vq.get('value', '')} {vq.get('unit', '')}".strip()
        elif "valueCodeableConcept" in resource:
            vc = resource["valueCodeableConcept"]
            val_str = vc.get("text") or (vc.get("coding", [{}])[0].get("display") if vc.get("coding") else "—")
        elif "valueString" in resource:
            val_str = str(resource["valueString"])
        elif resource.get("component"):
            parts = []
            for comp in resource["component"]:
                comp_name = comp.get("code", {}).get("text") or comp.get("code", {}).get("coding", [{}])[0].get("display", "")
                comp_val = comp.get("valueQuantity", {})
                parts.append(f"{comp_name}: {comp_val.get('value', '')} {comp_val.get('unit', '')}".strip(": "))
            val_str = "; ".join(parts)

        cats = resource.get("category", [])
        cat_str = "clinical"
        if cats and isinstance(cats, list) and cats[0].get("coding"):
            cat_str = cats[0]["coding"][0].get("code") or cats[0]["coding"][0].get("display") or "clinical"

        code_val = code_obj.get("coding", [{}])[0].get("code") if code_obj.get("coding") else "—"
        summary.update({
            "title": test_name,
            "display_name": test_name,
            "subtitle": f"Status: {resource.get('status', 'final')} | Cat: {cat_str} | Code: {code_val}",
            "primary_value": val_str,
            "secondary_value": resource.get("effectiveDateTime", resource.get("issued", "—")),
            "category": cat_str,
            "code": code_val,
        })

    elif rt == "Condition":
        code_obj = resource.get("code", {})
        diag_name = code_obj.get("text")
        if not diag_name and code_obj.get("coding"):
            diag_name = code_obj["coding"][0].get("display") or code_obj["coding"][0].get("code")
        diag_name = diag_name or "Condition"

        clin_stat = resource.get("clinicalStatus", {}).get("coding", [{}])[0].get("code", "active")
        ver_stat = resource.get("verificationStatus", {}).get("coding", [{}])[0].get("code", "confirmed")
        code_val = code_obj.get("coding", [{}])[0].get("code", "—") if code_obj.get("coding") else "—"

        summary.update({
            "title": diag_name,
            "display_name": diag_name,
            "subtitle": f"Status: {clin_stat} ({ver_stat}) | Code: {code_val}",
            "primary_value": f"Code: {code_val}",
            "secondary_value": resource.get("onsetDateTime", resource.get("recordedDate", "—")),
            "clinical_status": clin_stat,
            "verification_status": ver_stat,
            "code": code_val,
        })

    elif rt == "Encounter":
        cls = resource.get("class", {})
        cls_code = cls.get("code") or cls.get("display") or "ambulatory"
        type_obj = resource.get("type", [{}])[0] if resource.get("type") else {}
        reason = type_obj.get("text") or (type_obj.get("coding", [{}])[0].get("display") if type_obj.get("coding") else "Clinical Visit")
        period = resource.get("period", {})
        start_date = period.get("start", "—")

        summary.update({
            "title": f"Encounter: {cls_code.upper()}",
            "display_name": f"Encounter: {cls_code.upper()}",
            "subtitle": f"Reason: {reason} | Status: {resource.get('status', 'finished')}",
            "primary_value": cls_code,
            "secondary_value": start_date,
            "period": f"{start_date} to {period.get('end', 'ongoing')}",
        })

    return summary


def normalize_for_target(resource: dict, source_system: str) -> tuple[dict, str, str]:
    """Strip server-assigned fields, stamp a source identifier, and remap cross-resource references
    (e.g. Patient/123 -> Patient?identifier=urn:source:hapi|123) so target can resolve them idempotently."""
    res = copy.deepcopy(resource)
    src_id = res.pop("id", None)
    res.pop("meta", None)
    res.pop("text", None)  # server-generated narrative; may be stale after transformation
    system = f"urn:source:{source_system}"
    value = str(src_id)
    res.setdefault("identifier", []).append({"system": system, "value": value})

    # Remap foreign keys / cross-resource references to conditional references
    for key in ("subject", "patient", "encounter"):
        ref_obj = res.get(key)
        if isinstance(ref_obj, dict) and "reference" in ref_obj:
            ref_str = str(ref_obj["reference"])
            if "/" in ref_str and not ref_str.startswith("http") and "?" not in ref_str:
                ref_type, ref_val = ref_str.split("/", 1)
                ref_obj["reference"] = f"{ref_type}?identifier={system}|{ref_val}"

    return res, system, value


def ensure_parent_resource(hapi: HapiClient, medplum: MedplumClient, ref_str: str, source_name: str) -> None:
    """If a resource references a parent like 'Patient/123', ensure the parent exists in Medplum before delivery."""
    if not ref_str or "/" not in ref_str or ref_str.startswith("http") or "?" in ref_str:
        return
    parent_type, parent_id = ref_str.split("/", 1)
    system = f"urn:source:{source_name}"

    # 1. Check if Medplum already has this parent
    try:
        chk = medplum.client.get(
            f"{medplum.base_url}/fhir/R4/{parent_type}?identifier={system}|{parent_id}",
            headers=medplum._auth_header()
        )
        if chk.status_code == 200 and chk.json().get("entry"):
            return  # Parent already exists in Medplum
    except Exception:
        pass

    # 2. Parent missing in Medplum -> fetch from HAPI and auto-upsert
    try:
        src_resp = hapi.client.get(f"{hapi.base_url}/{parent_type}/{parent_id}")
        if src_resp.status_code == 200:
            parent_raw = src_resp.json()
            parent_norm, psys, pval = normalize_for_target(parent_raw, source_name)
            medplum.upsert(parent_norm, psys, pval)
            log.info("Auto-resolved parent", extra={"ctx": {"parent": f"{parent_type}/{parent_id}"}})
    except Exception as e:
        log.warning(f"Could not auto-resolve parent {parent_type}/{parent_id}: {e}")


def run_hapi_to_medplum(hapi: HapiClient, medplum: MedplumClient | None, *, source_name: str = "hapi",
                        resource_type: str = "Patient", count: int = 10, offset: int = 0, dry_run: bool = False) -> RunReport:
    report = RunReport()
    for src in hapi.fetch(resource_type, count=count, offset=offset):
        sid = src.get("id")
        res, system, value = normalize_for_target(src, source_name)
        summary = extract_clinical_summary(src)

        # Build derivation rules audit trail
        rules = [
            {"field": "id", "action": "Stripped server ID to allow Medplum native ID assignment"},
            {"field": "meta", "action": "Stripped source version and audit headers"},
            {"field": "text", "action": "Removed stale generated narrative XHTML text"},
            {"field": "identifier", "action": f"Injected scoped source identifier: {system}|{value}"},
        ]
        if summary.get("subject_reference") != "—":
            rules.append({
                "field": "subject",
                "action": f"Cross-Resource Remapping: Converted reference to idempotent conditional reference: {res.get('subject', {}).get('reference', '—')}"
            })
        rules.append({
            "field": "clinical_data",
            "action": f"Preserved {resource_type} payload ({summary['title']} • {summary['primary_value']})"
        })

        details = {
            "source_system": source_name,
            "source_id": sid,
            "target_system": "Medplum (FHIR R4)",
            "target_resource": resource_type,
            "idempotent_identifier": f"{system}|{value}",
            "conditional_query": f"?identifier={system}|{value}",
            "stripped_fields": ["id", "meta", "text"],
            "injected_identifiers": [{"system": system, "value": value}],
            "fhir_version": "R4 / R4B",
            "subject_reference": summary.get("subject_reference", "—"),
            "target_subject_reference": res.get("subject", {}).get("reference", "—"),
            "transform_rules": rules,
        }

        errors = validate_fhir(res)
        if errors:
            report.results.append(RecordResult(
                sid, "invalid", errors,
                patient_summary=summary, mapping_details=details,
                source_record=src, target_record=res
            ))
            log.warning("validation failed", extra={"ctx": {"source_id": sid, "errors": errors}})
            continue
        if dry_run or medplum is None:
            report.results.append(RecordResult(
                sid, "dry_run",
                patient_summary=summary, mapping_details=details,
                source_record=src, target_record=res
            ))
            continue
        try:
            # Auto-resolve parent dependencies (e.g. Patient) if this is a clinical resource
            subj_ref = src.get("subject", {}).get("reference") or src.get("patient", {}).get("reference")
            if subj_ref:
                ensure_parent_resource(hapi, medplum, subj_ref, source_name)

            out = medplum.upsert(res, system, value)
            is_created = out.get("_is_created", False)
            details["delivery_action"] = "created" if is_created else "updated"
            report.results.append(RecordResult(
                sid, "delivered", target_id=out.get("id"),
                patient_summary=summary, mapping_details=details,
                source_record=src, target_record=out
            ))
            log.info("delivered", extra={"ctx": {"source_id": sid, "target_id": out.get("id")}})
        except Exception as e:  # noqa: BLE001 - one bad record must not stop the batch
            report.results.append(RecordResult(
                sid, "failed", [str(e)],
                patient_summary=summary, mapping_details=details,
                source_record=src, target_record=res
            ))
            log.error("delivery failed", extra={"ctx": {"source_id": sid, "error": str(e)}})
    return report
