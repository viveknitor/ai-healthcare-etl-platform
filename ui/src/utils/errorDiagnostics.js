/**
 * Human-readable clinical FHIR R4 validation diagnostics and 1-click fixes.
 */

const MONTH_MAP = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function expandTwoDigitYear(yy) {
  const n = parseInt(yy, 10);
  if (Number.isNaN(n)) return null;
  const currentTwoDigit = new Date().getFullYear() % 100;
  return String(n > currentTwoDigit ? 1900 + n : 2000 + n);
}

/**
 * Deterministically normalize common healthcare date formats to ISO YYYY-MM-DD locally (zero PHI to LLM).
 */
export function normalizeLocalDateToIso(rawVal) {
  const s = String(rawVal ?? "").trim();
  if (!s) return null;

  // 1. Excel serial date
  const serial = convertExcelSerialToIso(s);
  if (serial) return serial;

  // 2. Already ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // 3. DD-Mon-YYYY or DD Mon YYYY or DD-Mon-YY (e.g. 15-Jun-1985, 15 Jun 85)
  const monMatch = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{2,4})$/);
  if (monMatch) {
    const day = monMatch[1].padStart(2, "0");
    const mon = MONTH_MAP[monMatch[2].slice(0, 3).toLowerCase()];
    const year = monMatch[3].length === 2 ? expandTwoDigitYear(monMatch[3]) : monMatch[3];
    if (mon && year && parseInt(day, 10) >= 1 && parseInt(day, 10) <= 31) {
      return `${year}-${mon}-${day}`;
    }
  }

  // 4. YY-MM-DD (e.g. 85-06-15)
  const yyMmDd = s.match(/^(\d{2})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (yyMmDd) {
    const year = expandTwoDigitYear(yyMmDd[1]);
    const p1 = parseInt(yyMmDd[2], 10);
    const p2 = parseInt(yyMmDd[3], 10);
    if (year && p1 >= 1 && p1 <= 12 && p2 >= 1 && p2 <= 31) {
      return `${year}-${String(p1).padStart(2, "0")}-${String(p2).padStart(2, "0")}`;
    }
    if (year && p1 > 12 && p2 >= 1 && p2 <= 12) {
      return `${year}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
    }
  }

  // 5. YYYY-DD-MM swapped or YYYY/MM/DD
  const yyyyFirst = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (yyyyFirst) {
    const y = yyyyFirst[1];
    const p1 = parseInt(yyyyFirst[2], 10);
    const p2 = parseInt(yyyyFirst[3], 10);
    if (p1 > 12 && p2 <= 12) {
      return `${y}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
    }
    if (p1 >= 1 && p1 <= 12 && p2 >= 1 && p2 <= 31) {
      return `${y}-${String(p1).padStart(2, "0")}-${String(p2).padStart(2, "0")}`;
    }
  }

  // 6. DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY
  const slashMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (slashMatch) {
    const a = parseInt(slashMatch[1], 10);
    const b = parseInt(slashMatch[2], 10);
    const y = slashMatch[3];
    if (a > 12 && b >= 1 && b <= 12) {
      return `${y}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
      return `${y}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
    }
  }

  // 7. Compact YYYYMMDD
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }

  return null;
}

export function convertExcelSerialToIso(rawVal) {
  const num = Number(String(rawVal ?? "").trim());
  if (!Number.isFinite(num) || num < 1 || num > 100000) return null;
  if (!/^\d+(\.\d+)?$/.test(String(rawVal ?? "").trim())) return null;
  const epochMs = Date.UTC(1899, 11, 30);
  const dt = new Date(epochMs + num * 86400000);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function resolveBirthDateColumn(rowData = {}, badVal = "") {
  const colKeys = Object.keys(rowData);
  const exactDob = colKeys.find((k) => {
    const l = k.toLowerCase();
    return l === "dob" || l === "birthdate" || l === "birth_date";
  });
  if (exactDob) return exactDob;
  const valMatch = colKeys.find((k) => String(rowData[k] ?? "").trim() === String(badVal).trim());
  if (valMatch) return valMatch;
  return colKeys.find((k) => k.toLowerCase().includes("date")) || "dob";
}

export function parseHumanDiagnostic(rawErr, rowData = {}, sourceId = "") {
  if (!rawErr) return null;
  const str = String(rawErr);

  // 1. Missing required source field
  if (str.includes("missing required source field") || str.includes("missing required field")) {
    const match = str.match(/'([^']+)'/);
    const missingCol = match ? match[1] : "memid";
    const suggested = sourceId && sourceId !== "—" ? sourceId : `MEM-${Date.now().toString().slice(-6)}`;
    return {
      field: missingCol,
      col: missingCol,
      title: `Missing Required Field: '${missingCol}'`,
      explanation: `The mapping contract requires '${missingCol}' to generate a valid FHIR R4 resource, but this record is missing '${missingCol}'.`,
      badValue: "Missing / Empty",
      suggestedFix: suggested,
      aiInstructions: [
        `Apply '${suggested}' to '${missingCol}' using the quick-fix button or enter a unique identifier.`,
        "Select Save & Re-Validate Record to promote the row out of quarantine.",
      ],
    };
  }

  // 2. Boolean mapping lookup error
  if (str.includes("no mapping for value")) {
    const matchVal = str.match(/no mapping for value '([^']+)'/);
    const badVal = matchVal ? matchVal[1] : "";
    const colMatch = str.match(/'([^']+)'\s*->/);
    const col = colMatch ? colMatch[1] : "issubscriber";
    let suggested = null;
    const upper = badVal.toUpperCase();
    if (upper === "Y" || upper === "1" || upper === "TRUE") suggested = "true";
    if (upper === "N" || upper === "0" || upper === "FALSE") suggested = "false";

    return {
      field: col,
      col,
      title: `Boolean Mapping Mismatch (${col})`,
      explanation: `The mapping rule for '${col}' uses transform 'map' without lookup entries for '${badVal}'. FHIR R4 booleans require 'true' or 'false'.`,
      badValue: badVal,
      suggestedFix: suggested,
      aiInstructions: [
        suggested
          ? `Apply '${suggested}' to normalize '${badVal}', or switch the rule transform in Step 2 to 'direct'.`
          : "Update value to 'true' or 'false'.",
        "Select Save & Re-Validate Record.",
      ],
    };
  }

  // 3. Date format error (Excel serial, DD-Mon-YYYY, YY-MM-DD, MM/DD/YYYY, swapped YYYY-DD-MM)
  if (str.includes("birthDate") || (str.includes("Date value") && str.includes("regex"))) {
    const valMatch = str.match(/input_value='([^']+)'/);
    const rawFromErr = valMatch ? valMatch[1] : "";
    const matchingCol = resolveBirthDateColumn(rowData, rawFromErr);
    const badVal = rawFromErr || String(rowData[matchingCol] ?? "").trim();

    const serialDate = convertExcelSerialToIso(badVal);
    if (serialDate) {
      return {
        category: "date_format",
        field: "birthDate",
        col: matchingCol,
        title: "Excel Serial Date Detected",
        explanation: `The value '${badVal}' in '${matchingCol}' is an Excel serial number rather than ISO-8601 (YYYY-MM-DD).`,
        badValue: badVal,
        suggestedFix: serialDate,
        aiInstructions: [
          `Apply '${serialDate}' to '${matchingCol}' with the 1-click converter.`,
          "Select Save & Re-Validate to promote out of quarantine.",
        ],
      };
    }

    const normalizedDate = normalizeLocalDateToIso(badVal);
    const isValidSuggestion = Boolean(normalizedDate && normalizedDate !== badVal);
    const explanation = isValidSuggestion
      ? `The date '${badVal}' in '${matchingCol}' can be normalized to ISO-8601 '${normalizedDate}'.`
      : `The date '${badVal}' does not match standard FHIR R4 format (YYYY-MM-DD).`;

    return {
      category: "date_format",
      field: "birthDate",
      col: matchingCol,
      title: "Date of Birth Format Violation",
      explanation,
      badValue: badVal,
      suggestedFix: isValidSuggestion ? normalizedDate : "YYYY-MM-DD",
      aiInstructions: [
        `Inspect '${badVal}' in '${matchingCol}'.`,
        isValidSuggestion
          ? `Apply '${normalizedDate}' with one click.`
          : "Enter a valid YYYY-MM-DD date (for example, 1985-06-15).",
        "Select Save & Re-Validate.",
      ],
    };
  }

  // 4. DateTime missing timezone
  if (str.includes("deceasedDateTime") || str.includes("DateTime value")) {
    const valMatch = str.match(/input_value='([^']+)'/);
    const badVal = valMatch ? valMatch[1] : "";
    const cleanDate = badVal.split("T")[0];
    const suggestion = convertExcelSerialToIso(badVal) || cleanDate || "YYYY-MM-DD";

    const matchingCol =
      Object.keys(rowData).find(
        (k) =>
          String(rowData[k] ?? "") === badVal ||
          k.toLowerCase().includes("death") ||
          k.toLowerCase().includes("deceased")
      ) || "deathdate";

    return {
      field: "deceasedDateTime",
      col: matchingCol,
      title: "DateTime Format Notice (Timezone Required)",
      explanation: `FHIR R4 dateTime requires an explicit timezone ('Z' or '+00:00') when time is included, or a plain date (YYYY-MM-DD). Value '${badVal}' lacks a timezone.`,
      badValue: badVal,
      suggestedFix: suggestion,
      aiInstructions: [
        `Normalize '${matchingCol}' to '${suggestion}' or append 'Z' UTC offset.`,
        "Select Save & Re-Validate Record.",
      ],
    };
  }

  // 5. Choice type collision
  if (str.includes("Any of one field value is expected from this list")) {
    return {
      field: "multipleBirth",
      col: "multiplebirth",
      title: "Conflicting Choice Attributes",
      explanation: "FHIR R4 choice elements allow only one variant (multipleBirthBoolean OR multipleBirthInteger), not both.",
      badValue: "Multiple choice types present",
      suggestedFix: "true",
      aiInstructions: [
        "Keep multipleBirthBoolean as true/false and remove conflicting integer paths.",
        "Select Save & Re-Validate Record.",
      ],
    };
  }

  const cleanMsg = str.replace(/https:\/\/errors\.pydantic\.dev[^\s]*/g, "").trim();
  return {
    field: "general",
    col: null,
    title: "Validation Violation",
    explanation: cleanMsg,
    badValue: "",
    suggestedFix: null,
    aiInstructions: [
      "Verify the highlighted field values against HL7 FHIR R4 constraints.",
      "Correct invalid dates, numbers, or enum codes and click Save & Re-Validate Record.",
    ],
  };
}

export function formatHumanTableRowError(rawErr, sourceId = "") {
  if (!rawErr) return "";
  const diag = parseHumanDiagnostic(rawErr, {}, sourceId);
  if (!diag) return String(rawErr);
  if (diag.suggestedFix && diag.suggestedFix !== "YYYY-MM-DD") {
    return `${diag.field}: ${diag.title} — Suggested fix: '${diag.suggestedFix}'`;
  }
  const summary = diag.explanation.length > 108 ? `${diag.explanation.slice(0, 108)}…` : diag.explanation;
  return `${diag.title}: ${summary}`;
}

/**
 * Group quarantined rows by deterministic fix category so users can resolve recurring issues in 1 click.
 */
export function groupFixableQuarantineIssues(results = [], allRows = []) {
  const groups = new Map();

  results.forEach((r, index) => {
    const isInvalid = r?.status === "invalid" || (r?.errors && r.errors.length > 0);
    if (!isInvalid || !r.errors?.length) return;
    const rowData = r.source_record || allRows[index] || {};
    const diag = parseHumanDiagnostic(r.errors[0], rowData, r.source_id);
    if (!diag || !diag.col || !diag.suggestedFix || diag.suggestedFix === "YYYY-MM-DD") return;

    const category = diag.category || (diag.field === "birthDate" ? "date_format" : diag.field);
    if (!groups.has(category)) {
      const label =
        category === "date_format"
          ? "Date format"
          : diag.title;
      const buttonLabel =
        category === "date_format"
          ? "Fix All Date Issues"
          : `Fix All ${diag.field} Issues`;
      groups.set(category, {
        category,
        label,
        buttonLabel,
        field: diag.field,
        fixes: [],
      });
    }
    groups.get(category).fixes.push({
      index,
      col: diag.col,
      suggestedFix: diag.suggestedFix,
    });
  });

  return Array.from(groups.values()).map((g) => ({
    ...g,
    count: g.fixes.length,
  }));
}
