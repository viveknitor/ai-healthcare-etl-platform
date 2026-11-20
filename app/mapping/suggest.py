"""AI mapping agent: PROPOSES a MappingConfig. Output is always 'pending_review' - never auto-run."""
import json
import re
import time

try:
    import truststore
    truststore.inject_into_ssl()
except Exception:
    pass

import httpx

from .models import MappingConfig

SYSTEM = """You are a senior healthcare interoperability and HL7 FHIR R4 data integration architect.
Given a sample source record (e.g. from an EHR, SQL Server table, or insurance feed) and a target FHIR R4 resource type, propose a comprehensive, high-fidelity field mapping covering as many clinical and demographic attributes as possible.

Respond with ONLY a valid JSON object:
{
  "name": str,
  "target_resource": str,
  "constants": {targetPath: value},
  "rules": [
    {
      "source": "sourceColumnName",
      "target": "FHIR path using dots and array indexes (e.g. identifier[0].value, name[0].text, birthDate, communication[0].language.coding[0].code)",
      "transform": "direct|date|map|upper|lower|strip",
      "args": {},
      "required": bool,
      "confidence": 0.0 to 1.0,
      "rationale": "Short explanation of semantic match"
    }
  ]
}

Comprehensive Mapping Guidelines for FHIR R4 Patient:
1. Identifiers: Map all primary, alternate, external, and enterprise IDs to identifier[0].value, identifier[1].value, etc. (e.g. memid, ssn, ExternalId, entityid, secondaryid, enterpriseid, umin). Always populate constants for each identifier: "identifier[n].system" (e.g. "http://hl7.org/fhir/sid/us-ssn" for SSN, "http://hospital.smarthealth.org/{id_name}") and "identifier[n].type.text" (e.g. "Member ID", "SSN", "Entity ID").
2. Demographics:
   - Full or split names -> name[0].text or name[0].given[0] / name[0].family.
   - Sex/Gender -> gender using transform "map" (e.g. {"M": "male", "F": "female", "default": "unknown"}).
   - Date of Birth -> birthDate (transform "date" if not YYYY-MM-DD).
   - Death Date -> deceasedDateTime (transform "date").
   - Status -> active using transform "map" (e.g. {"ACTIVE": true, "A": true, "TERM": false, "T": false, "default": true}).
   - Marital Status -> maritalStatus.coding[0].code.
   - Multiple Birth -> multipleBirthBoolean (exact camelCase with capital B; do not use multiplebirthBoolean; transform "map" e.g. {"1": true, "0": false}).
   - Language -> communication[0].language.coding[0].code (or text).
3. Relationships & Contacts:
   - Guardian / Head of House -> contact[0].name.text, contact[1].name.text.
4. Healthcare & SDoH Extensions:
   - Ethnicity, Gender Identity, VIP status, Subscriber status, Median Income -> extension[n].valueString, extension[n].valueBoolean, or extension[n].valueDecimal.
5. Internal Database Audit Columns (e.g. createdate, createid, lastupdate, updateid, externalediting): omit or map only if required.
FHIR R4 field names are strictly case-sensitive. Always use standard camelCase (e.g. multipleBirthBoolean, birthDate, deceasedBoolean, valueBoolean, valueDecimal).
Do not invent source fields that do not exist in the sample."""


class SuggestError(Exception):
    pass


def suggest_mapping(sample: dict, target_resource: str, *, api_key: str, model: str,
                    transport: httpx.BaseTransport | None = None) -> MappingConfig:
    if not api_key:
        raise SuggestError("GEMINI_API_KEY (or GOOGLE_API_KEY) not set")

    # Resilient model fallback chain to prevent 503 high-demand or 429 rate-limit interruptions
    models_to_try = [model]
    for m in ("gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-flash-latest"):
        if m not in models_to_try:
            models_to_try.append(m)

    payload = {
        "system_instruction": {
            "parts": [{"text": SYSTEM}]
        },
        "contents": [
            {
                "role": "user",
                "parts": [{"text": f"Target resource: {target_resource}\nSample record:\n{json.dumps(sample, indent=2)}"}]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "response_mime_type": "application/json"
        }
    }

    last_error = None
    r = None
    successful_model = model
    start_time = time.perf_counter()

    for attempt_model in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{attempt_model}:generateContent"
        try:
            with httpx.Client(transport=transport, timeout=45) as c:
                r = c.post(
                    url,
                    params={"key": api_key},
                    headers={
                        "x-goog-api-key": api_key,
                        "content-type": "application/json"
                    },
                    json=payload
                )
            if r.status_code == 200:
                successful_model = attempt_model
                break
            elif r.status_code in (503, 429, 404):
                last_error = f"{attempt_model} ({r.status_code}): {r.text[:150]}"
                if transport:
                    # If this is a mock unit test transport, don't loop
                    break
                continue
            else:
                raise SuggestError(f"LLM call failed: {r.status_code} {r.text[:200]}")
        except httpx.TimeoutException:
            last_error = f"{attempt_model} timed out"
            continue
        except Exception as e:
            if transport:
                raise
            last_error = str(e)
            continue

    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

    if r is None or r.status_code != 200:
        raise SuggestError(f"All AI models temporarily unavailable (503/High Demand): {last_error}")
    data = r.json()
    text = ""
    if "candidates" in data:
        candidates = data.get("candidates", [])
        if not candidates:
            raise SuggestError("LLM returned no candidates")
        text = "".join(p.get("text", "") for p in candidates[0].get("content", {}).get("parts", []))
    elif "content" in data:
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    else:
        raise SuggestError(f"Unexpected LLM response format: {r.text[:200]}")
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        cfg = MappingConfig.model_validate(json.loads(text))
        cfg.name = f"{target_resource.lower()}_mapping"
    except Exception as e:  # noqa: BLE001
        raise SuggestError(f"LLM returned an invalid mapping: {e}") from e

    # Extract token metrics and calculate real USD cost
    usage = data.get("usageMetadata", {})
    prompt_tokens = usage.get("promptTokenCount", 0)
    completion_tokens = usage.get("candidatesTokenCount", 0)
    total_tokens = usage.get("totalTokenCount", prompt_tokens + completion_tokens)

    # Gemini official pricing ($0.075 / 1M prompt, $0.30 / 1M completion for flash; half for flash-lite)
    if "flash-lite" in successful_model.lower():
        cost_usd = (prompt_tokens * 0.0000000375) + (completion_tokens * 0.00000015)
    else:
        cost_usd = (prompt_tokens * 0.000000075) + (completion_tokens * 0.00000030)

    cfg.metadata["llm_metrics"] = {
        "model": successful_model,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "cost_usd": round(cost_usd, 6),
        "cost_formatted": f"${cost_usd:.5f}",
        "latency_ms": elapsed_ms,
    }

    # Normalize target path tokens to official FHIR R4 camelCase
    from .engine import _FHIR_FIELD_CASE_MAP
    for r in cfg.rules:
        parts = r.target.split(".")
        new_parts = []
        for p in parts:
            clean_p = p.split("[")[0].lower()
            if clean_p in _FHIR_FIELD_CASE_MAP:
                canon = _FHIR_FIELD_CASE_MAP[clean_p]
                if "[" in p:
                    new_parts.append(canon + p[p.index("["):])
                else:
                    new_parts.append(canon)
            else:
                new_parts.append(p)
        r.target = ".".join(new_parts)

    # Guardrails: model cannot approve its own work, and every source path must exist in the sample.
    cfg.status = "pending_review"
    from .engine import MISSING, get_path
    bad = [r.source for r in cfg.rules if get_path(sample, r.source) is MISSING]
    if bad:
        raise SuggestError(f"LLM referenced source fields not in sample: {bad}")
    return cfg
