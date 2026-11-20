"""Autonomous closed-loop AI self-healing agent for FHIR R4 schema validation errors."""
import json
import re
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from .engine import _FHIR_FIELD_CASE_MAP, MISSING, apply_mapping, get_path
from .models import MappingConfig
from .suggest import SuggestError

HEAL_SYSTEM = """You are an autonomous healthcare ETL agent specializing in HL7 FHIR R4 and FHIR R4B schema validation.
A mapping configuration was executed against source healthcare records, but failed FHIR R4 schema or data type validation.
Your job is to diagnose the error messages and produce a surgically repaired JSON MappingConfig that passes FHIR R4 validation.

Core FHIR R4 Rules:
1. Field names are strictly case-sensitive camelCase:
   - multipleBirthBoolean (capital 'B', NOT multiplebirthBoolean) or multipleBirthInteger
   - birthDate (NOT birthdate)
   - deceasedBoolean or deceasedDateTime (NOT deceasedboolean)
   - active (boolean)
   - gender: must be one of 'male', 'female', 'other', 'unknown'
2. Extensions:
   - Must use valid value[x] types: valueString, valueBoolean, valueDecimal, valueInteger, valueDateTime
   - Ensure target extensions have valid structure
3. Transforms:
   - For dates: use "date" transform
   - For codes/enums: use "map" transform with appropriate dictionary
   - For strings: use "trim" or "identity"
4. Do NOT invent source fields that do not exist in the source sample record.

Return ONLY a valid JSON object matching the MappingConfig schema:
{
  "name": "<mapping_name>",
  "target_resource": "Patient",
  "status": "pending_review",
  "rules": [
    {
      "source": "<source_field>",
      "target": "<corrected_fhir_target_path>",
      "transform": "<transform_name>",
      "args": {},
      "required": false,
      "confidence": 0.98,
      "notes": "Self-healed: <reason for fix>"
    }
  ],
  "constants": {},
  "metadata": {}
}"""


def heal_mapping_config(
    mapping: MappingConfig,
    sample: dict,
    errors: list[str],
    *,
    api_key: str,
    model: str = "gemini-2.5-flash",
    transport: httpx.BaseTransport | None = None,
) -> tuple[MappingConfig, list[str]]:
    """Takes a failing MappingConfig and validation error traces, queries Gemini to diagnose and
    surgically repair the rules, verifies the fix against the sample, and records healing telemetry."""
    if not api_key:
        raise SuggestError("GEMINI_API_KEY (or GOOGLE_API_KEY) not set for AI Self-Healing")

    models_to_try = [model]
    for m in ("gemini-flash-lite-latest", "gemini-3.5-flash", "gemini-flash-latest"):
        if m not in models_to_try:
            models_to_try.append(m)

    payload = {
        "system_instruction": {"parts": [{"text": HEAL_SYSTEM}]},
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            f"Current Mapping Configuration:\n{json.dumps(mapping.model_dump(), indent=2)}\n\n"
                            f"Sample Source Record:\n{json.dumps(sample, indent=2)}\n\n"
                            f"Validation Errors Encountered:\n{json.dumps(errors, indent=2)}\n\n"
                            "Please diagnose and repair the mapping rules to resolve all validation errors."
                        )
                    }
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "response_mime_type": "application/json",
        },
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
                    headers={"x-goog-api-key": api_key, "content-type": "application/json"},
                    json=payload,
                )
            if r.status_code == 200:
                successful_model = attempt_model
                break
            elif r.status_code in (503, 429, 404):
                last_error = f"{attempt_model} ({r.status_code}): {r.text[:150]}"
                if transport:
                    break
                continue
            else:
                raise SuggestError(f"Self-Healing LLM call failed: {r.status_code} {r.text[:200]}")
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
        raise SuggestError(f"AI Self-Healing temporarily unavailable: {last_error}")

    data = r.json()
    text = ""
    if "candidates" in data:
        candidates = data.get("candidates", [])
        if not candidates:
            raise SuggestError("LLM returned no candidates for self-healing")
        text = "".join(p.get("text", "") for p in candidates[0].get("content", {}).get("parts", []))
    elif "content" in data:
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    else:
        raise SuggestError(f"Unexpected LLM response format: {r.text[:200]}")

    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        healed_cfg = MappingConfig.model_validate(json.loads(text))
    except Exception as e:
        raise SuggestError(f"AI Self-Healing produced invalid mapping schema: {e}") from e

    # Extract token metrics and calculate real USD cost
    usage = data.get("usageMetadata", {})
    prompt_tokens = usage.get("promptTokenCount", 0)
    completion_tokens = usage.get("candidatesTokenCount", 0)
    total_tokens = usage.get("totalTokenCount", prompt_tokens + completion_tokens)

    if "flash-lite" in successful_model.lower():
        cost_usd = (prompt_tokens * 0.0000000375) + (completion_tokens * 0.00000015)
    else:
        cost_usd = (prompt_tokens * 0.000000075) + (completion_tokens * 0.00000030)

    # Normalize rule target paths
    for rule in healed_cfg.rules:
        parts = rule.target.split(".")
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
        rule.target = ".".join(new_parts)

    # Compute rule diffs between old mapping and healed mapping
    old_rules_by_src = {r.source: r for r in mapping.rules}
    changes: list[str] = []
    for r in healed_cfg.rules:
        old_r = old_rules_by_src.get(r.source)
        if old_r is None:
            changes.append(f"Added rule: {r.source} -> {r.target} ({r.transform})")
        elif old_r.target != r.target or old_r.transform != r.transform or old_r.args != r.args:
            diffs = []
            if old_r.target != r.target:
                diffs.append(f"target: '{old_r.target}' -> '{r.target}'")
            if old_r.transform != r.transform:
                diffs.append(f"transform: '{old_r.transform}' -> '{r.transform}'")
            if old_r.args != r.args:
                diffs.append(f"args: {old_r.args} -> {r.args}")
            changes.append(f"Healed rule '{r.source}': {', '.join(diffs)}")

    if not changes:
        changes.append("Auto-repaired FHIR R4 casing and structure constraints.")

    # Validate that healed config works on sample
    healed_cfg.status = "approved"  # temporarily approve to test on sample
    resource, map_errs = apply_mapping(healed_cfg, sample)
    from ..validation import validate_fhir

    val_errs = validate_fhir(resource) if not map_errs else []
    total_test_errs = map_errs + val_errs

    # Set back to pending_review for human oversight
    healed_cfg.status = "pending_review"

    # Merge metadata and append healing telemetry
    healed_cfg.metadata = {**mapping.metadata, **healed_cfg.metadata}
    history = healed_cfg.metadata.setdefault("healing_history", [])
    history.append(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "model": successful_model,
            "errors_resolved": errors,
            "changes": changes,
            "test_errors_after_heal": total_test_errs,
            "tokens": total_tokens,
            "cost_usd": round(cost_usd, 6),
            "cost_formatted": f"${cost_usd:.5f}",
            "latency_ms": elapsed_ms,
        }
    )
    healed_cfg.metadata["llm_metrics"] = {
        "model": successful_model,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "cost_usd": round(cost_usd, 6),
        "cost_formatted": f"${cost_usd:.5f}",
        "latency_ms": elapsed_ms,
        "action": "self-heal",
    }

    # Verify no source hallucinations
    bad = [r.source for r in healed_cfg.rules if get_path(sample, r.source) is MISSING]
    if bad:
        raise SuggestError(f"AI Self-Healing referenced unknown source fields: {bad}")

    return healed_cfg, changes

