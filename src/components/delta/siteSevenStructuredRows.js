// テキストPDF・CSVから厳密に解析できた行を、グラフ共同照合用の共通形式へ変換する。
// ここでは配列位置から台番号を推測せず、行自身の一意な台番号だけを固定点にする。

function toAscii(value) {
  return String(value ?? "").normalize("NFKC");
}

function normalizeMachineNumber(value) {
  const text = toAscii(value).trim();
  if (!/^\d+$/u.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? String(parsed) : null;
}

function normalizeNonNegativeInteger(value, { allowPayoutSuffix = false } = {}) {
  let text = toAscii(value).trim();
  if (allowPayoutSuffix) text = text.replace(/玉$/u, "");
  text = text.replace(/[，,\s]/gu, "");
  if (!/^\d+$/u.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function hasValue(row, field) {
  return Object.prototype.hasOwnProperty.call(row, field)
    && row[field] !== null
    && row[field] !== undefined
    && String(row[field]).trim() !== "";
}

function validateStructuredValues(row) {
  const normalSpins = normalizeNonNegativeInteger(row?.normalSpins);
  const totalStarts = normalizeNonNegativeInteger(row?.totalStarts);
  if (normalSpins === null || totalStarts === null) return false;

  const cumulativeStarts = hasValue(row, "cumulativeStarts")
    ? normalizeNonNegativeInteger(row.cumulativeStarts)
    : null;
  const firstHitCount = hasValue(row, "firstHitCount")
    ? normalizeNonNegativeInteger(row.firstHitCount)
    : null;
  if (hasValue(row, "cumulativeStarts") && cumulativeStarts === null) return false;
  if (hasValue(row, "firstHitCount") && firstHitCount === null) return false;
  if (cumulativeStarts !== null && normalSpins > cumulativeStarts) return false;
  if (firstHitCount !== null && firstHitCount > totalStarts) return false;
  return true;
}

function normalizedSourceIndex(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function duplicateNumbersFromResult(parsedResult, normalizedRows) {
  const counts = new Map();
  for (const row of normalizedRows) {
    if (row.num === null) continue;
    counts.set(row.num, (counts.get(row.num) || 0) + 1);
  }
  const duplicates = new Set(
    [...counts.entries()].filter(([, count]) => count > 1).map(([num]) => num),
  );
  for (const duplicate of Array.isArray(parsedResult?.duplicates) ? parsedResult.duplicates : []) {
    const num = normalizeMachineNumber(duplicate?.num);
    if (num !== null) duplicates.add(num);
  }
  return duplicates;
}

/**
 * 厳密解析済みのPDF/CSV result（またはrows配列）を共同matcher用へ整形する。
 * 同じ呼び出し内の重複に加え、parserのduplicates報告も固定点から除外する。
 */
export function buildSiteSevenStructuredRows(parsedResult, {
  importKind = "pdf",
  sourceIndex = 0,
  sourceId = "",
} = {}) {
  const sourceRows = Array.isArray(parsedResult)
    ? parsedResult
    : Array.isArray(parsedResult?.rows) ? parsedResult.rows : [];
  const normalizedRows = sourceRows.map((row) => ({
    row: row && typeof row === "object" ? row : {},
    num: normalizeMachineNumber(row?.num),
    maxPayout: hasValue(row || {}, "maxPayout")
      ? normalizeNonNegativeInteger(row?.maxPayout, { allowPayoutSuffix: true })
      : null,
    hasMaxPayout: hasValue(row || {}, "maxPayout"),
  }));
  const duplicateNumbers = duplicateNumbersFromResult(parsedResult, normalizedRows);
  const normalizedKind = String(importKind || "pdf").trim().toLowerCase() || "pdf";
  const normalizedIndex = normalizedSourceIndex(sourceIndex);
  const normalizedSourceId = String(sourceId || normalizedKind).trim() || normalizedKind;

  return normalizedRows.map((entry, rowIndex) => {
    const { row, num, maxPayout, hasMaxPayout } = entry;
    const reasons = [];
    const reviewPending = row.reviewRequired === true && row.reviewConfirmed !== true;
    const duplicateNumber = num !== null && duplicateNumbers.has(num);
    const validStructuredValues = validateStructuredValues(row);
    const explicitNumberRejection = row.numAccepted === false
      || row?.fieldAccepted?.num === false;

    if (num === null) reasons.push("invalid-machine-number");
    if (duplicateNumber) reasons.push("duplicate-machine-number");
    if (!validStructuredValues) reasons.push("invalid-structured-values");
    if (reviewPending) reasons.push("review-pending");
    if (explicitNumberRejection) reasons.push("machine-number-rejected");
    if (!hasMaxPayout) reasons.push("missing-max-payout");
    else if (maxPayout === null) reasons.push("invalid-max-payout");

    const structuredRowTrusted = num !== null
      && !duplicateNumber
      && validStructuredValues
      && !reviewPending
      && !explicitNumberRejection
      && (!hasMaxPayout || maxPayout !== null);
    const numAccepted = structuredRowTrusted;
    const maxPayoutAccepted = structuredRowTrusted && maxPayout !== null;

    return {
      ...row,
      ...(num !== null ? { num } : {}),
      ...(maxPayout !== null ? { maxPayout } : {}),
      numAccepted,
      maxPayoutAccepted,
      sourceIndex: normalizedIndex,
      rowIndex,
      rowId: `${normalizedSourceId}:${normalizedIndex}:${rowIndex}`,
      importKind: normalizedKind,
      structuredRowTrusted,
      structuredTrustReasons: reasons,
    };
  });
}
