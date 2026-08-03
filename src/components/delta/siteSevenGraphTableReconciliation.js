import { alignSiteSevenTableRows } from "./siteSevenTableRowAlignment.js";

const MINIMUM_ROW_COUNT = 4;
const MINIMUM_ACCEPTED_ANCHOR_RATIO = 0.6;
const MINIMUM_OBSERVED_MATCH_RATIO = 0.85;
const MINIMUM_ALIGNMENT_MARGIN = 5;

function normalizeMachineNumber(value) {
  const text = String(value ?? "").trim().replaceAll(",", "");
  if (!/^\d+$/u.test(text)) return "";
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? String(parsed) : "";
}

function normalizedSourceName(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function graphCandidate(slot) {
  return normalizeMachineNumber(
    slot?.machineNumberOcr?.candidate
      ?? slot?.machineNumberCandidate
      ?? slot?.observedNumCandidate
      ?? slot?.machineNumber,
  );
}

function observedTableNumber(row) {
  return normalizeMachineNumber(
    row?.machineNumberObserved
      ?? row?.machineNumberCandidate
      ?? row?.observedNumCandidate
      ?? row?.num,
  );
}

function unchanged(rows, reasonCode, extra = {}) {
  return {
    applied: false,
    reasonCode,
    resolvedCount: 0,
    rows,
    ...extra,
  };
}

/**
 * Resolve weak table machine-number OCR from a separate, fully accepted graph
 * sequence. This is deliberately stricter than ordinary row alignment:
 * every graph number must be independently accepted and unique, the table and
 * graph files must differ, trusted table anchors must have no conflict, and
 * the overwhelming majority of raw table candidates must already agree by
 * row position. Numeric play data is never changed here.
 */
export function reconcileSiteSevenRowsWithGraphSequence(tableRows, numberOcr) {
  const rows = Array.isArray(tableRows) ? tableRows : [];
  const slots = Array.isArray(numberOcr?.slots) ? numberOcr.slots : [];
  const expectedNumbers = Array.isArray(numberOcr?.numbers)
    ? numberOcr.numbers.map(normalizeMachineNumber)
    : [];

  if (numberOcr?.accepted !== true) return unchanged(rows, "graph-sequence-not-accepted");
  if (rows.length < MINIMUM_ROW_COUNT) return unchanged(rows, "too-few-table-rows");
  if (slots.length !== rows.length || expectedNumbers.length !== rows.length) {
    return unchanged(rows, "row-count-mismatch");
  }
  if (expectedNumbers.some((number) => !number)
    || new Set(expectedNumbers).size !== expectedNumbers.length) {
    return unchanged(rows, "graph-sequence-invalid");
  }
  if ((numberOcr?.failedPageIndices?.length || 0) > 0
    || (numberOcr?.unresolvedIndices?.length || 0) > 0
    || (numberOcr?.duplicateNumbers?.length || 0) > 0
    || (numberOcr?.duplicateMachineNumbers?.length || 0) > 0) {
    return unchanged(rows, "graph-sequence-incomplete");
  }

  const graphCandidates = slots.map(graphCandidate);
  const allGraphNumbersAccepted = slots.every((slot) => (
    slot?.machineNumberOcr?.accepted === true
  ));
  if (!allGraphNumbersAccepted
    || graphCandidates.some((candidate, index) => candidate !== expectedNumbers[index])) {
    return unchanged(rows, "graph-slot-evidence-incomplete");
  }

  const graphSources = [...new Set(slots
    .map((slot) => normalizedSourceName(slot?.source?.imageName))
    .filter(Boolean))];
  const tableSources = [...new Set(rows
    .map((row) => normalizedSourceName(row?.sourceFile))
    .filter(Boolean))];
  if (graphSources.length === 0 || tableSources.length === 0
    || tableSources.some((source) => graphSources.includes(source))) {
    return unchanged(rows, "cross-image-independence-missing");
  }

  let alignment;
  try {
    alignment = alignSiteSevenTableRows(rows, expectedNumbers);
  } catch {
    return unchanged(rows, "table-alignment-failed");
  }
  const positionPreserved = alignment?.rowAssignments?.length === rows.length
    && alignment.rowAssignments.every((assignment, index) => (
      assignment?.rowIndex === index
      && assignment?.expectedIndex === index
      && assignment?.expectedNumber === expectedNumbers[index]
      && Number(assignment?.pathMargin) >= MINIMUM_ALIGNMENT_MARGIN
    ));
  const completeAlignment = alignment?.summary?.assignedCount === rows.length
    && alignment?.summary?.extraRowCount === 0
    && alignment?.summary?.missingExpectedCount === 0;
  if (!completeAlignment || !positionPreserved) {
    return unchanged(rows, "table-alignment-not-stable", { alignment });
  }

  const acceptedAnchors = rows.reduce((count, row, index) => (
    count + (row?.numAccepted === true
      && normalizeMachineNumber(row?.num) === expectedNumbers[index] ? 1 : 0)
  ), 0);
  const acceptedAnchorConflicts = rows.reduce((count, row, index) => (
    count + (row?.numAccepted === true
      && normalizeMachineNumber(row?.num) !== expectedNumbers[index] ? 1 : 0)
  ), 0);
  const observedMatchCount = rows.reduce((count, row, index) => (
    count + (observedTableNumber(row) === expectedNumbers[index] ? 1 : 0)
  ), 0);
  const minimumAcceptedAnchors = Math.max(
    3,
    Math.ceil(rows.length * MINIMUM_ACCEPTED_ANCHOR_RATIO),
  );
  const minimumObservedMatches = Math.max(
    minimumAcceptedAnchors,
    Math.ceil(rows.length * MINIMUM_OBSERVED_MATCH_RATIO),
  );
  if (acceptedAnchorConflicts > 0
    || acceptedAnchors < minimumAcceptedAnchors
    || observedMatchCount < minimumObservedMatches) {
    return unchanged(rows, "table-anchor-evidence-insufficient", {
      alignment,
      acceptedAnchors,
      acceptedAnchorConflicts,
      observedMatchCount,
      minimumAcceptedAnchors,
      minimumObservedMatches,
    });
  }

  let resolvedCount = 0;
  const resolvedRows = rows.map((row, index) => {
    const expectedNumber = expectedNumbers[index];
    const observedNumber = observedTableNumber(row);
    const wasAccepted = row?.numAccepted === true
      && normalizeMachineNumber(row?.num) === expectedNumber;
    if (!wasAccepted) resolvedCount += 1;
    const nonNumberReviewRequired = row?.nonNumberReviewRequired === true;
    const globalReviewRequired = row?.globalReviewRequired === true;
    const reviewRequired = nonNumberReviewRequired || globalReviewRequired;
    return {
      ...row,
      num: expectedNumber,
      numAccepted: true,
      machineNumberSuggested: expectedNumber,
      machineNumberResolutionSource: "independent-graph-sequence",
      machineNumberAlignment: alignment.rowAssignments[index],
      fieldAccepted: row?.fieldAccepted
        ? { ...row.fieldAccepted, num: true }
        : row?.fieldAccepted,
      fieldReviewRequired: row?.fieldReviewRequired
        ? { ...row.fieldReviewRequired, num: false }
        : row?.fieldReviewRequired,
      fieldReviewReason: row?.fieldReviewReason
        ? { ...row.fieldReviewReason, num: "" }
        : row?.fieldReviewReason,
      reviewRequired,
      reviewConfirmed: false,
      reviewReason: nonNumberReviewRequired
        ? String(row?.nonNumberReviewReason || "")
        : globalReviewRequired
          ? String(row?.reviewReason || "")
          : "",
      machineNumberCrossImageResolution: {
        source: "independent-graph-sequence",
        expectedNumber,
        observedNumber,
        graphSources,
        tableSources,
        alignmentConfidence: alignment.rowAssignments[index]?.alignmentConfidence || 0,
        corrected: !wasAccepted,
      },
    };
  });

  return {
    applied: true,
    reasonCode: "independent-graph-sequence",
    resolvedCount,
    rows: resolvedRows,
    expectedNumbers,
    graphSources,
    tableSources,
    alignment,
    acceptedAnchors,
    acceptedAnchorConflicts,
    observedMatchCount,
    minimumAcceptedAnchors,
    minimumObservedMatches,
  };
}
