import copy
import re
import time
from dataclasses import asdict, dataclass, field

from .connectors.hapi import HapiClient
from .connectors.medplum import MedplumClient
from .logging_setup import get_logger
from .mapping.engine import MISSING, get_path
from .telemetry import telemetry
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
    reconciliation_table: list[dict] = field(default_factory=list)
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


COMMON_FIELD_LABELS: dict[str, str] = {
    "resourceType": "Resource Type / Domain",
    "id": "Logical Resource ID",
    "meta": "Metadata & Audit Headers",
    "text": "Narrative Text (XHTML)",
    "identifier": "Identifiers / MRN",
    "active": "Active Status",
    "name": "Full Legal Name",
    "telecom": "Contact Telecom (Phone / Email)",
    "gender": "Administrative Gender",
    "birthDate": "Date of Birth",
    "deceasedBoolean": "Deceased Status",
    "deceasedDateTime": "Date of Death",
    "address": "Postal Address",
    "maritalStatus": "Marital Status",
    "multipleBirthBoolean": "Multiple Birth",
    "multipleBirthInteger": "Birth Order",
    "photo": "Patient Photo",
    "contact": "Emergency Contacts",
    "communication": "Languages & Communication",
    "generalPractitioner": "Primary Care Provider",
    "managingOrganization": "Managing Healthcare Org",
    "status": "Clinical / Document Status",
    "category": "Category / Classification",
    "code": "Clinical Code / Concept (LOINC/SNOMED)",
    "subject": "Subject Reference (Patient Link)",
    "patient": "Patient Reference",
    "encounter": "Encounter Context",
    "effectiveDateTime": "Effective Date & Time",
    "effectivePeriod": "Effective Period",
    "issued": "Issued Timestamp",
    "performer": "Clinician / Performer",
    "valueQuantity": "Clinical Value (Quantity)",
    "valueCodeableConcept": "Clinical Finding (Coded)",
    "valueString": "Clinical Value (Text)",
    "valueBoolean": "Clinical Finding (Boolean)",
    "valueInteger": "Clinical Value (Integer)",
    "valueRange": "Clinical Range",
    "valueRatio": "Clinical Ratio",
    "valueTime": "Clinical Measurement Time",
    "valueDateTime": "Clinical Measurement Date/Time",
    "valuePeriod": "Clinical Measurement Period",
    "dataAbsentReason": "Data Absent Reason",
    "interpretation": "Interpretation / Flag",
    "note": "Clinical Notes",
    "bodySite": "Anatomical Body Site",
    "method": "Measurement Method",
    "specimen": "Specimen Reference",
    "device": "Measurement Device",
    "referenceRange": "Normal Reference Range",
    "hasMember": "Related Observations",
    "derivedFrom": "Derived From Source",
    "component": "Observation Sub-Components",
    "clinicalStatus": "Clinical Status",
    "verificationStatus": "Verification Status",
    "severity": "Severity Level",
    "onsetDateTime": "Onset Date & Time",
    "onsetAge": "Onset Age",
    "onsetPeriod": "Onset Period",
    "onsetRange": "Onset Range",
    "onsetString": "Onset Description",
    "abatementDateTime": "Abatement Date & Time",
    "recordedDate": "Recorded / Logged Date",
    "recorder": "Recorder Clinician",
    "asserter": "Information Asserter",
    "stage": "Clinical Stage",
    "evidence": "Diagnostic Evidence",
    "class": "Encounter Class (Inpatient/Outpatient)",
    "type": "Encounter Specific Type",
    "serviceType": "Type of Service",
    "priority": "Encounter Priority",
    "episodeOfCare": "Episode of Care",
    "basedOn": "Order / Service Request Link",
    "participant": "Encounter Participants / Care Team",
    "appointment": "Associated Appointment",
    "period": "Encounter Period (Start - End)",
    "length": "Encounter Duration",
    "reasonCode": "Reason for Visit / Admission",
    "reasonReference": "Associated Condition",
    "diagnosis": "Admission / Discharge Diagnoses",
    "hospitalization": "Hospitalization Details",
    "location": "Hospital Location / Room",
    "serviceProvider": "Healthcare Service Provider",
}


def get_field_display_label(field_key: str, resource_type: str | None = None) -> str:
    """Returns a clean, human-readable display label for ANY field dynamically."""
    if field_key in COMMON_FIELD_LABELS:
        return COMMON_FIELD_LABELS[field_key]
    # Split camelCase and replace separators
    s1 = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", field_key)
    return s1.replace("_", " ").replace("-", " ").title()


def format_dynamic_value(val: any) -> str:
    """Recursively formats any nested FHIR data type or arbitrary JSON into a clean, human-readable string."""
    if val is None or val == "":
        return "—"
    if isinstance(val, (int, float, bool)):
        return str(val)
    if isinstance(val, str):
        return val.strip() or "—"
    if isinstance(val, list):
        if not val:
            return "—"
        formatted_items = [format_dynamic_value(item) for item in val if item is not None]
        valid_items = [i for i in formatted_items if i and i != "—"]
        if not valid_items:
            return "—"
        if len(valid_items) == 1:
            return valid_items[0]
        return "; ".join(valid_items)
    if isinstance(val, dict):
        # 1. FHIR HumanName
        if "family" in val or "given" in val:
            given = " ".join(val.get("given", [])) if isinstance(val.get("given"), list) else str(val.get("given", ""))
            family = str(val.get("family", ""))
            use = f" ({val['use']})" if val.get("use") else ""
            name = f"{given} {family}".strip()
            return f"{name}{use}" if name else val.get("text", "—")
        # 2. FHIR Quantity
        if "value" in val and ("unit" in val or "code" in val):
            return f"{val.get('value', '')} {val.get('unit') or val.get('code') or ''}".strip()
        # 3. FHIR CodeableConcept
        if "coding" in val or "text" in val:
            txt = val.get("text")
            if txt:
                return txt
            codings = val.get("coding", [])
            if codings and isinstance(codings, list):
                c = codings[0]
                disp = c.get("display") or c.get("code")
                sys = c.get("system", "").split("/")[-1] if c.get("system") else ""
                code = f" [{c.get('code')}]" if c.get("code") and c.get("display") else ""
                return f"{disp}{code}" + (f" ({sys})" if sys else "")
            return "—"
        # 4. FHIR Coding alone
        if "code" in val and ("display" in val or "system" in val):
            disp = val.get("display") or val.get("code")
            return f"{disp} [{val.get('code')}]" if val.get("display") else str(val.get("code"))
        # 5. FHIR Identifier
        if "value" in val and "system" in val:
            sys_short = val["system"].split("/")[-1].split(":")[-1]
            return f"{sys_short}: {val['value']}"
        # 6. FHIR Reference
        if "reference" in val or "display" in val:
            ref = val.get("reference", "")
            disp = val.get("display", "")
            if ref and disp:
                return f"{disp} ({ref})"
            return disp or ref or "—"
        # 7. FHIR Period
        if "start" in val or "end" in val:
            start = val.get("start", "—")
            end = val.get("end", "present")
            return f"{start} → {end}"
        # 8. FHIR Address
        if any(k in val for k in ("line", "city", "state", "postalCode", "country")):
            lines = ", ".join(val.get("line", [])) if isinstance(val.get("line"), list) else str(val.get("line", ""))
            parts = [lines, val.get("city"), val.get("state"), val.get("postalCode"), val.get("country")]
            return ", ".join(filter(None, [str(p).strip() for p in parts if p]))
        # 9. FHIR ContactPoint / Telecom
        if "system" in val and "value" in val:
            use = f" ({val['use']})" if val.get("use") else ""
            return f"{val.get('system')}: {val.get('value')}{use}"
        # 10. General dictionary
        parts = []
        for k, v in val.items():
            if k in ("id", "meta", "text"):
                continue
            fv = format_dynamic_value(v)
            if fv and fv != "—":
                parts.append(f"{k}: {fv}")
        return "; ".join(parts) if parts else "—"
    return str(val)


def generate_dynamic_reconciliation(source_res: dict | None, target_res: dict | None,
                                     source_name: str = "Source", target_name: str = "Medplum",
                                     mapping: Any = None) -> list[dict]:
    """Generates a schema-agnostic, field-by-field dynamic reconciliation and derivation matrix.
    When a MappingConfig is provided, it maps each source column directly to its target FHIR path.
    Otherwise, it compares source and target FHIR fields directly."""
    source_res = source_res or {}
    target_res = target_res or {}
    rt = target_res.get("resourceType") or (getattr(mapping, "target_resource", None) if mapping else None) or source_res.get("resourceType") or "Resource"

    # --- Case 1: MappingConfig is provided (e.g. Database / CSV Upload to FHIR) ---
    if mapping is not None and getattr(mapping, "rules", None):
        matrix = []

        # System-level Resource Type
        matrix.append({
            "field": "resourceType",
            "label": "Resource Type / Domain",
            "source_raw": None,
            "source_display": "—",
            "rule": f"Defaulted FHIR resource type for {target_name}",
            "status": "generated",
            "target_raw": rt,
            "target_display": rt,
        })

        def _extract_target_val(target: dict, rule_target: str, rule_source: str) -> Any:
            val = get_path(target, rule_target)
            if val is not MISSING and val is not None:
                return val
            if "extension" in rule_target and "extension" in target:
                target_url = f"urn:source:extension:{rule_source}"
                for ext in target.get("extension", []):
                    if isinstance(ext, dict) and ext.get("url") == target_url:
                        for k, v in ext.items():
                            if k.startswith("value"):
                                return v
            return None

        mapped_sources = set()
        for rule in mapping.rules:
            mapped_sources.add(rule.source)
            src_val = source_res.get(rule.source)
            tgt_val = _extract_target_val(target_res, rule.target, rule.source)

            src_disp = format_dynamic_value(src_val)
            tgt_disp = format_dynamic_value(tgt_val)

            if src_val in (None, ""):
                status = "empty"
                rule_desc = f"Source field empty in record ({rule.source} -> {rule.target})"
            elif tgt_val is not None:
                if str(src_val).strip() == str(tgt_disp).strip() or src_val == tgt_val:
                    status = "preserved"
                    rule_desc = f"Direct mapped: {rule.source} -> {rule.target}"
                else:
                    status = "transformed"
                    rule_desc = f"Transformed: {rule.source} ({src_disp}) -> {rule.target} ({tgt_disp})"
            else:
                status = "dropped"
                rule_desc = f"Unmapped in destination payload ({rule.source} -> {rule.target})"

            matrix.append({
                "field": rule.source,
                "label": f"{get_field_display_label(rule.source, rt)} ({rule.source})",
                "source_raw": src_val,
                "source_display": src_disp,
                "rule": rule_desc,
                "status": status,
                "target_raw": tgt_val,
                "target_display": tgt_disp,
            })

        # Check for unmapped source columns
        for col, val in source_res.items():
            if col not in mapped_sources:
                matrix.append({
                    "field": col,
                    "label": f"{get_field_display_label(col, rt)} ({col})",
                    "source_raw": val,
                    "source_display": format_dynamic_value(val),
                    "rule": f"Unmapped source column (omitted from {target_name} FHIR payload)",
                    "status": "dropped",
                    "target_raw": None,
                    "target_display": "—",
                })

        # Scoped idempotent identifier
        for ident in target_res.get("identifier", []):
            if isinstance(ident, dict) and str(ident.get("system", "")).startswith("urn:source:"):
                matrix.append({
                    "field": "identifier",
                    "label": "Scoped Identity System",
                    "source_raw": ident.get("value"),
                    "source_display": format_dynamic_value(ident.get("value")),
                    "rule": f"Injected idempotent scoped identifier ({ident.get('system')}|{ident.get('value')}) for conditional upsert",
                    "status": "scoped_identity",
                    "target_raw": ident,
                    "target_display": f"{ident.get('system')}|{ident.get('value')}",
                })
                break

        # Assigned ID if present
        if target_res.get("id"):
            matrix.append({
                "field": "id",
                "label": f"Native {target_name} ID",
                "source_raw": None,
                "source_display": "—",
                "rule": f"Assigned native UUID by {target_name}",
                "status": "generated",
                "target_raw": target_res.get("id"),
                "target_display": str(target_res.get("id")),
            })

        return matrix

    # --- Case 2: FHIR-to-FHIR direct reconciliation (e.g. HAPI to Medplum) ---
    all_keys = list(dict.fromkeys(list(source_res.keys()) + list(target_res.keys())))

    priority_order = [
        "resourceType", "id", "identifier", "status", "clinicalStatus", "verificationStatus",
        "category", "code", "name", "gender", "birthDate", "telecom", "address",
        "valueQuantity", "valueCodeableConcept", "valueString", "component",
        "subject", "patient", "encounter", "period", "effectiveDateTime", "onsetDateTime",
        "performer", "reasonCode", "meta", "text"
    ]
    def sort_key(k):
        if k in priority_order:
            return (0, priority_order.index(k))
        return (1, k)

    all_keys.sort(key=sort_key)

    matrix = []
    for key in all_keys:
        src_val = source_res.get(key)
        tgt_val = target_res.get(key)

        src_disp = format_dynamic_value(src_val)
        tgt_disp = format_dynamic_value(tgt_val)

        if key in ("meta", "text") and src_val is not None and tgt_val is None:
            status = "sanitized"
            rule = f"Server-assigned {key} stripped to ensure destination purity & avoid stale narrative"
            tgt_disp = "— (Omitted for destination)"
        elif key == "id" and src_val is not None:
            if tgt_val and tgt_val != src_val:
                status = "generated"
                rule = f"Native {target_name} UUID assigned; source ID indexed in identifier system"
            else:
                status = "sanitized"
                rule = f"Source ID stripped from body; {target_name} native ID assigned upon commit"
        elif key == "identifier":
            status = "scoped_identity"
            rule = f"Injected idempotent scoped identifier (urn:source:{source_name.lower()}|<id>) for conditional upsert"
        elif key in ("subject", "patient", "encounter") and src_val is not None:
            if tgt_val and str(tgt_val) != str(src_val):
                status = "remapped_reference"
                rule = "Cross-resource conditional reference remapped to target identifier query"
            else:
                status = "preserved"
                rule = "Reference preserved directly in destination schema"
        elif src_val is not None and tgt_val is not None:
            if src_val == tgt_val:
                status = "preserved"
                rule = "Direct normalized copy into destination schema"
            else:
                status = "transformed"
                rule = "Normalized / transformed according to target schema"
        elif src_val is not None and tgt_val is None:
            status = "dropped"
            rule = "Unmapped or omitted in destination payload"
        elif src_val is None and tgt_val is not None:
            status = "generated"
            rule = f"Generated / defaulted by ETL pipeline for {target_name}"
        else:
            status = "empty"
            rule = "No data in source or target"

        matrix.append({
            "field": key,
            "label": get_field_display_label(key, rt),
            "source_raw": src_val,
            "source_display": src_disp,
            "rule": rule,
            "status": status,
            "target_raw": tgt_val,
            "target_display": tgt_disp,
        })

    return matrix


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
            display_name = f"{given} {family}".strip() or str(n.get("text") or "").strip() or "Unknown"
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


def ensure_parent_resource(hapi: HapiClient, medplum: MedplumClient, ref_str: str, source_name: str, visited: set | None = None) -> bool:
    """If a resource references a parent like 'Patient/123' or 'Encounter/456',
    ensure the parent exists in Medplum before delivery.
    Recursively resolves dependencies (e.g. Encounter -> Patient).
    Returns True if parent exists or was successfully created, False otherwise."""
    if not ref_str or "/" not in ref_str or ref_str.startswith("http") or "?" in ref_str:
        return False
    if visited is None:
        visited = set()
    if ref_str in visited:
        return True
    visited.add(ref_str)

    parent_type, parent_id = ref_str.split("/", 1)
    system = f"urn:source:{source_name}"

    # 1. Check if Medplum already has this parent
    try:
        chk = medplum.client.get(
            f"{medplum.base_url}/fhir/R4/{parent_type}?identifier={system}|{parent_id}",
            headers=medplum._auth_header()
        )
        if chk.status_code == 200 and chk.json().get("entry"):
            return True  # Parent already exists in Medplum
    except Exception:
        pass

    # 2. Parent missing in Medplum -> fetch from HAPI and auto-upsert
    try:
        src_resp = hapi.client.get(f"{hapi.base_url}/{parent_type}/{parent_id}")
        if src_resp.status_code == 200:
            parent_raw = src_resp.json()

            # Recursively resolve dependencies of this parent (e.g. Encounter references Patient)
            for sub_key in ("subject", "patient"):
                sub_ref = parent_raw.get(sub_key, {}).get("reference")
                if sub_ref:
                    ensure_parent_resource(hapi, medplum, sub_ref, source_name, visited)

            parent_norm, psys, pval = normalize_for_target(parent_raw, source_name)
            medplum.upsert(parent_norm, psys, pval)
            log.info("Auto-resolved parent", extra={"ctx": {"parent": f"{parent_type}/{parent_id}"}})
            return True
        else:
            log.warning(f"Parent {parent_type}/{parent_id} returned HTTP {src_resp.status_code} from source")
            return False
    except Exception as e:
        log.warning(f"Could not auto-resolve parent {parent_type}/{parent_id}: {e}")
        return False


def run_hapi_to_medplum(hapi: HapiClient, medplum: MedplumClient | None, *, source_name: str = "hapi",
                        resource_type: str = "Patient", count: int = 10, offset: int = 0, dry_run: bool = False) -> RunReport:
    t_start = time.perf_counter()
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
        recon_pre = generate_dynamic_reconciliation(src, res, source_name, "Medplum")
        if errors:
            report.results.append(RecordResult(
                sid, "invalid", errors,
                patient_summary=summary, mapping_details=details,
                reconciliation_table=recon_pre,
                source_record=src, target_record=res
            ))
            log.warning("validation failed", extra={"ctx": {"source_id": sid, "errors": errors}})
            continue
        if dry_run or medplum is None:
            report.results.append(RecordResult(
                sid, "dry_run",
                patient_summary=summary, mapping_details=details,
                reconciliation_table=recon_pre,
                source_record=src, target_record=res
            ))
            continue
        try:
            # Auto-resolve parent dependencies for all linked references (subject, patient, encounter)
            for ref_key in ("subject", "patient", "encounter"):
                ref_obj = src.get(ref_key)
                if isinstance(ref_obj, dict) and "reference" in ref_obj:
                    raw_ref = str(ref_obj["reference"])
                    resolved = ensure_parent_resource(hapi, medplum, raw_ref, source_name)
                    # If this reference could not be resolved in Medplum (e.g. broken reference on HAPI),
                    # strip the unresolvable encounter from res so Medplum doesn't reject the record with 400
                    if not resolved and ref_key == "encounter" and "encounter" in res:
                        log.warning(f"Stripping unresolvable encounter {raw_ref} to allow clinical ingestion")
                        del res["encounter"]

            out = medplum.upsert(res, system, value)
            is_created = out.get("_is_created", False)
            details["delivery_action"] = "created" if is_created else "updated"
            recon_post = generate_dynamic_reconciliation(src, out, source_name, "Medplum")
            report.results.append(RecordResult(
                sid, "delivered", target_id=out.get("id"),
                patient_summary=summary, mapping_details=details,
                reconciliation_table=recon_post,
                source_record=src, target_record=out
            ))
            log.info("delivered", extra={"ctx": {"source_id": sid, "target_id": out.get("id")}})
        except Exception as e:  # noqa: BLE001 - one bad record must not stop the batch
            report.results.append(RecordResult(
                sid, "failed", [str(e)],
                patient_summary=summary, mapping_details=details,
                reconciliation_table=recon_pre,
                source_record=src, target_record=res
            ))
            log.error("delivery failed", extra={"ctx": {"source_id": sid, "error": str(e)}})
    if report.results:
        elapsed = max(0.001, time.perf_counter() - t_start)
        counts = report.summary()["counts"]
        telemetry.record_run(
            total=len(report.results),
            valid=counts.get("delivered", 0) + counts.get("dry_run", 0),
            invalid=counts.get("invalid", 0) + counts.get("failed", 0),
            delivered=counts.get("delivered", 0),
            dry_run=dry_run or medplum is None,
            duration_sec=elapsed,
            source=f"hapi:{resource_type}",
        )
    return report
