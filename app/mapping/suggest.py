"""AI mapping agent: PROPOSES a MappingConfig. Output is always 'pending_review' - never auto-run."""
import json
import re

try:
    import truststore
    truststore.inject_into_ssl()
except Exception:
    pass

import httpx

from .models import MappingConfig

SYSTEM = """You are a healthcare data-integration expert. Given a sample source JSON record and a
target FHIR R4 resource type, propose a field mapping. Respond with ONLY a JSON object:
{"name": str, "target_resource": str, "constants": {targetPath: value},
 "rules": [{"source": path, "target": FHIR path using dots and [n] indexes, "transform":
 one of direct|date|map|upper|lower|strip, "args": {}, "required": bool,
 "confidence": 0..1, "rationale": short string}]}
Use transform "date" with args {"from": strptime format} when the source date is not YYYY-MM-DD.
Use transform "map" with args {sourceValue: fhirCode} for code conversion (e.g. gender -> male|female|other|unknown).
Only map fields you can justify. Lower confidence when the semantics are ambiguous. Do not invent source fields."""


class SuggestError(Exception):
    pass


def suggest_mapping(sample: dict, target_resource: str, *, api_key: str, model: str,
                    transport: httpx.BaseTransport | None = None) -> MappingConfig:
    if not api_key:
        raise SuggestError("GEMINI_API_KEY (or GOOGLE_API_KEY) not set")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
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
    with httpx.Client(transport=transport, timeout=60) as c:
        r = c.post(
            url,
            params={"key": api_key},
            headers={
                "x-goog-api-key": api_key,
                "content-type": "application/json"
            },
            json=payload
        )
    if r.status_code != 200:
        raise SuggestError(f"LLM call failed: {r.status_code} {r.text[:200]}")
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
    except Exception as e:  # noqa: BLE001
        raise SuggestError(f"LLM returned an invalid mapping: {e}") from e
    # Guardrails: model cannot approve its own work, and every source path must exist in the sample.
    cfg.status = "pending_review"
    from .engine import MISSING, get_path
    bad = [r.source for r in cfg.rules if get_path(sample, r.source) is MISSING]
    if bad:
        raise SuggestError(f"LLM referenced source fields not in sample: {bad}")
    return cfg
