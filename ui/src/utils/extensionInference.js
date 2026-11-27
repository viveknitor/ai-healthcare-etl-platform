/**
 * Unified FHIR R4 extension type inference and contract rule helpers.
 */

export function inferFhirExtensionValueType(columnName = "") {
  const lower = String(columnName).toLowerCase();
  if (
    lower.includes("income") ||
    lower.includes("amount") ||
    lower.includes("cost") ||
    lower.includes("rate") ||
    lower.includes("price") ||
    lower.includes("salary")
  ) {
    return "valueDecimal";
  }
  if (
    lower.startsWith("is") ||
    lower.startsWith("has") ||
    lower.includes("flag") ||
    lower.includes("active")
  ) {
    return "valueBoolean";
  }
  return "valueString";
}

export function cleanBooleanMapRules(rules = []) {
  return rules.map((r) => {
    const tgtLower = r.target?.toLowerCase() || "";
    const isBoolTarget = tgtLower.includes("boolean") || tgtLower.endsWith(".active");
    const hasNoArgs = !r.transform_args || Object.keys(r.transform_args).length === 0;
    if (isBoolTarget && r.transform === "map" && hasNoArgs) {
      return { ...r, transform: "direct" };
    }
    return r;
  });
}

export function buildExtensionRule(columnName, extIndex) {
  const valType = inferFhirExtensionValueType(columnName);
  return {
    source: columnName,
    target: `extension[${extIndex}].${valType}`,
    transform: "direct",
    confidence: 0.85,
    rationale: `Mapped source column ${columnName} to FHIR R4 extension`,
    required: false,
  };
}

export function appendAllRemainingExtensionRules(mapping, unmappedHeaders = []) {
  if (!mapping) return mapping;
  const cleanedExisting = cleanBooleanMapRules(mapping.rules || []);
  let extIdx = cleanedExisting.filter(
    (r) => r.target && r.target.startsWith("extension[")
  ).length;

  const newRules = unmappedHeaders.map((col) => buildExtensionRule(col, extIdx++));
  return {
    ...mapping,
    status: "pending_review",
    rules: [...cleanedExisting, ...newRules],
  };
}

export function appendSingleExtensionRule(mapping, columnName) {
  if (!mapping || !columnName) return mapping;
  const existing = mapping.rules || [];
  const extIdx = existing.filter(
    (r) => r.target && r.target.startsWith("extension[")
  ).length;
  return {
    ...mapping,
    status: "pending_review",
    rules: [...existing, buildExtensionRule(columnName, extIdx)],
  };
}
