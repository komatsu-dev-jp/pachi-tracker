/** Local-only display OCR review and safe append helpers. */
export const DISPLAY_OCR_FIELDS = ["machineNumber", "rotations", "jackpots", "payout", "businessDate", "storeName", "machineName"];
const NUMBER_FIELDS = new Set(["machineNumber", "rotations", "jackpots", "payout"]);
const STATUSES = new Set(["unknown", "unconfirmed", "confirmed", "conflict"]);

export function parseDisplayNumber(raw) {
  const text = String(raw ?? "").trim().replace(/[，,\s]/gu, "").replace(/[−－ー]/gu, "-");
  if (!/^-?\d+$/u.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function makeOcrField(rawText = "", value = null, confidence = 0, source = "ocr", status = "unconfirmed") {
  const safeValue = typeof value === "number" ? (Number.isFinite(value) ? value : null) : (typeof value === "string" && value !== "" ? value : null);
  return {
    rawText: String(rawText ?? ""), value: safeValue,
    confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : 0,
    source: source === "manual" ? "manual" : "ocr",
    status: STATUSES.has(status) ? status : "unknown",
  };
}

export function setDisplayFieldValue(row, key, rawText) {
  const raw = String(rawText ?? "");
  const value = NUMBER_FIELDS.has(key) ? parseDisplayNumber(raw) : (raw.trim() || null);
  return { ...(row || {}), [key]: makeOcrField(raw, value, row?.[key]?.confidence ?? 0, "manual", "unconfirmed") };
}

export function confirmDisplayField(row, key) {
  const field = row?.[key] || makeOcrField();
  const present = NUMBER_FIELDS.has(key) ? Number.isFinite(field.value) : typeof field.value === "string" && field.value.trim() !== "";
  return { ...(row || {}), [key]: { ...field, status: present ? "confirmed" : "unconfirmed" } };
}

function fieldFromMatch(text, labels, numeric) {
  for (const label of labels) {
    const match = String(text ?? "").match(new RegExp(`${label}\\s*[:：]?\\s*([^\\n\\r]+)`, "iu"));
    if (match) {
      const raw = match[1].trim();
      return makeOcrField(raw, numeric ? parseDisplayNumber(raw) : (raw || null), 0, "ocr", raw ? "unconfirmed" : "unknown");
    }
  }
  return makeOcrField("", null, 0, "ocr", "unknown");
}

function dateCandidates(text) {
  const matches = [...String(text ?? "").matchAll(/(?:\u55b6\u696d\u65e5|\u96c6\u8a08\u65e5|\u30c7\u30fc\u30bf\u65e5)\s*[:\uff1a]?\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2})/gu)]
    .map((match) => match[1].replaceAll("/", "-"));
  return [...new Set(matches)];
}

export function parseDisplayOcrText(text) {
  const dates = dateCandidates(text);
  const date = dates[0] || "";
  return {
    machineNumber: fieldFromMatch(text, ["\u53f0\u756a\u53f7", "\u53f0\u756a"], true),
    rotations: fieldFromMatch(text, ["\u56de\u8ee2\u6570", "\u30b9\u30bf\u30fc\u30c8"], true),
    jackpots: fieldFromMatch(text, ["\u5927\u5f53\u308a\u56de\u6570", "\u5927\u5f53\u308a"], true),
    payout: fieldFromMatch(text, ["\u5dee\u7389", "\u5dee\u679a"], true),
    businessDate: makeOcrField(date, date || null, 0, "ocr", dates.length > 1 ? "conflict" : (date ? "unconfirmed" : "unknown")),
    storeName: fieldFromMatch(text, ["\u5e97\u8217\u540d", "\u5e97\u8217"], false),
    machineName: fieldFromMatch(text, ["\u6a5f\u7a2e\u540d", "\u6a5f\u7a2e"], false),
  };
}

function fieldsOf(entry) { return entry?.fields || entry || {}; }
export function normalizeDisplayRow(entry) {
  const fields = Object.fromEntries(DISPLAY_OCR_FIELDS.map((key) => [key, fieldsOf(entry)[key] || makeOcrField("", null, 0, "ocr", "unknown")]));
  const machineNumber = Number.isFinite(fields.machineNumber.value) ? String(Math.trunc(fields.machineNumber.value)) : null;
  const saveable = DISPLAY_OCR_FIELDS.every((key) => fields[key].status === "confirmed")
    && [...NUMBER_FIELDS].every((key) => Number.isFinite(fields[key].value))
    && ["businessDate", "storeName", "machineName"].every((key) => typeof fields[key].value === "string" && fields[key].value.trim() !== "");
  return { fields, machineNumber, status: saveable ? "confirmed" : "conflict", saveable, conflicts: [] };
}

function targetValues(target = {}, fallback = {}) {
  return { date: target.date ?? fallback.date ?? "", storeName: target.storeName ?? fallback.storeName ?? "", machineName: target.machineName ?? fallback.machineName ?? "" };
}

export function validateDisplayRows(rows, options = {}) {
  const target = options.target || options;
  const expected = targetValues(target, options.context);
  const existing = new Set((Array.isArray(target?.rows) ? target.rows : []).map((row) => String(row?.num ?? "")).filter(Boolean));
  const numbers = new Map();
  const normalized = (Array.isArray(rows) ? rows : []).map(normalizeDisplayRow);
  normalized.forEach((row, index) => { if (row.machineNumber) numbers.set(row.machineNumber, [...(numbers.get(row.machineNumber) || []), index]); });
  return normalized.map((row) => {
    const conflicts = [...row.conflicts];
    if (!row.saveable) conflicts.push("unconfirmed");
    if (!row.machineNumber || (numbers.get(row.machineNumber)?.length || 0) > 1 || existing.has(row.machineNumber)) conflicts.push("machine-number");
    [["businessDate", expected.date], ["storeName", expected.storeName], ["machineName", expected.machineName]].forEach(([key, value]) => {
      if (!value || String(row.fields[key].value) !== String(value)) conflicts.push(key);
    });
    return { ...row, status: conflicts.length ? "conflict" : "confirmed", conflicts: [...new Set(conflicts)] };
  });
}

function canonical(row) { return JSON.stringify(row.fields); }
function resultStatus(results) { return results.some((row) => row.status === "appended") ? "appended" : results.some((row) => row.status === "conflict") ? "conflict" : "noop"; }

/** Pure reducer; App persists its returned scans through one existing atomic mutation. */
export function mergeDisplayScanRows(scans, request) {
  const list = Array.isArray(scans) ? scans : [];
  const targetScanId = String(request?.targetScanId ?? "");
  const fingerprint = String(request?.sourceFingerprint?.hash ?? "").toLowerCase();
  const index = list.findIndex((scan) => String(scan?.id) === targetScanId);
  if (index < 0) return { status: "missing", scans: list, rowResults: [] };
  if (!/^[a-f0-9]{64}$/u.test(fingerprint)) return { status: "failed", scans: list, rowResults: [] };
  const target = list[index];
  const history = Array.isArray(target.appendHistory) ? target.appendHistory : [];
  const input = Array.isArray(request?.rows) ? request.rows : [];
  const rowResults = input.map((entry) => ({ entry, normalized: normalizeDisplayRow(entry) }));
  // History is checked first so an identical retry remains a noop even though its row now exists in target.rows.
  const pending = rowResults.filter((item) => {
    const num = item.normalized.machineNumber;
    const key = `${targetScanId}:${fingerprint}:${num}`;
    const found = history.find((entry) => entry?.key === key);
    if (!found) return true;
    item.status = found.payload === canonical(item.normalized) ? "noop" : "conflict";
    item.conflicts = item.status === "conflict" ? ["retry-mismatch"] : [];
    return false;
  });
  // A different source fingerprint is a new import attempt, not a retry: the
  // target's existing machine number must remain a conflict boundary.
  const validated = validateDisplayRows(pending.map((item) => item.entry), { target });
  pending.forEach((item, itemIndex) => { item.normalized = validated[itemIndex]; item.status = validated[itemIndex].status === "confirmed" ? "appended" : "conflict"; item.conflicts = validated[itemIndex].conflicts; });
  const additions = rowResults.filter((item) => item.status === "appended");
  if (!additions.length) return { status: resultStatus(rowResults), scans: list, rowResults };
  const appendedAt = new Date().toISOString();
  const nextTarget = {
    ...target,
    rows: [...(Array.isArray(target.rows) ? target.rows : []), ...additions.map(({ normalized }) => ({
      num: normalized.machineNumber, val: normalized.fields.payout.value, normalSpins: normalized.fields.rotations.value,
      totalStarts: normalized.fields.jackpots.value, machineName: normalized.fields.machineName.value,
      displayOcr: normalized.fields, source: "display-ocr", status: "review", reviewConfirmed: true,
    }))],
    appendHistory: [...history, ...additions.map(({ normalized }) => ({ key: `${targetScanId}:${fingerprint}:${normalized.machineNumber}`, payload: canonical(normalized), appendedAt }))],
  };
  return { status: resultStatus(rowResults), scans: list.map((scan, scanIndex) => scanIndex === index ? nextTarget : scan), rowResults };
}
