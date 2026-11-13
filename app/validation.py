from fhir.resources.R4B import get_fhir_model_class


# Required-binding code checks that structural models don't enforce. Extend per resource as you grow.
REQUIRED_CODES = {
    ("Patient", "gender"): {"male", "female", "other", "unknown"},
}


def validate_fhir(resource: dict) -> list[str]:
    """Structural FHIR validation (types, cardinality, enums) using fhir.resources (R4B models, which
    match R4 for core resources like Patient). Returns error strings; empty list means valid.
    Profile-level and terminology validation belong to the target server (Medplum $validate) - see README."""
    rt = resource.get("resourceType")
    if not rt:
        return ["missing resourceType"]
    try:
        model = get_fhir_model_class(rt)
    except Exception:  # noqa: BLE001
        return [f"unknown resourceType '{rt}'"]
    try:
        model.model_validate(resource)
    except Exception as e:  # noqa: BLE001 - pydantic ValidationError
        return [line.strip() for line in str(e).splitlines() if line.strip()][:10]
    for (r, field), allowed in REQUIRED_CODES.items():
        if r == rt and field in resource and resource[field] not in allowed:
            return [f"{rt}.{field}: '{resource[field]}' not in {sorted(allowed)}"]
    return []
