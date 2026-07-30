// A short trace is never accepted from a single permissive pixel threshold.
// Promotion requires exact agreement across conservative threshold profiles,
// plus independent table/graph identity, order, and max-payout evidence. Any
// missing or conflicting signal leaves the original review result unchanged.

const SAFE_SHORT_SERIES_REASONS = new Set([
  "short-series",
  "faint-series",
]);

const TRUSTED_NUMBER_MATCH_TYPES = new Set([
  "num-exact",
  "num-and-max-exact",
]);

const TRUSTED_NUMBER_MATCHED_BY = new Set([
  "num",
  "num+max",
]);

function normalizeMachineNumber(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/u.test(text)) return null;
  const number = Number.parseInt(text, 10);
  return Number.isSafeInteger(number) && number > 0 ? String(number) : null;
}

function finiteNonNegativeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function finiteOrder(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function graphPageKey(slot) {
  return String(slot?.source?.imageIndex ?? slot?.pageIndex ?? "page");
}

function compareGraphPosition(left, right) {
  return finiteOrder(left.slot?.source?.row ?? left.slot?.row, left.index)
    - finiteOrder(right.slot?.source?.row ?? right.slot?.row, right.index)
    || finiteOrder(left.slot?.source?.column ?? left.slot?.column, 0)
      - finiteOrder(right.slot?.source?.column ?? right.slot?.column, 0)
    || left.index - right.index;
}

function addReason(reasons, condition, code) {
  if (condition && !reasons.includes(code)) reasons.push(code);
}

function validateGraphEvidence(slot) {
  const reasons = [];
  const slotReasons = Array.isArray(slot?.reasonCodes) ? slot.reasonCodes : [];
  const evidence = slot?.shortSeriesEvidence;
  const calibration = slot?.calibration;
  const endpointLocalY = Number(evidence?.endpointLocalY);
  const plotTopY = Number(calibration?.plotTopY);
  const plotBottomY = Number(calibration?.plotBottomY);
  const gridSpacing = Number(calibration?.gridSpacing);
  const boundaryMargin = Number.isFinite(gridSpacing)
    ? Math.max(2.5, gridSpacing * 0.08)
    : null;

  addReason(reasons, slot?.status !== "review", "short-series-not-review");
  addReason(reasons, !slotReasons.includes("short-series"), "short-series-reason-missing");
  addReason(
    reasons,
    slotReasons.some((reason) => !SAFE_SHORT_SERIES_REASONS.has(reason)),
    "short-series-has-unsafe-graph-reason",
  );
  addReason(reasons, !Number.isFinite(Number(slot?.val)), "short-series-value-missing");
  addReason(reasons, Number(slot?.confidence) < 0.8, "short-series-confidence-too-low");
  addReason(reasons, calibration?.source !== "panel", "short-series-panel-calibration-missing");
  addReason(reasons, Number(calibration?.quality) < 0.7, "short-series-calibration-too-low");
  addReason(reasons, evidence?.accepted !== true, "short-series-threshold-consensus-missing");
  addReason(
    reasons,
    !Number.isInteger(evidence?.profileCount)
      || evidence.profileCount < 4
      || evidence.profileCount !== evidence?.requiredProfileCount,
    "short-series-threshold-profile-count",
  );
  addReason(
    reasons,
    !Number.isFinite(Number(evidence?.roundedValue)),
    "short-series-consensus-value-missing",
  );
  addReason(
    reasons,
    evidence?.primaryValueAgrees !== true
      || (Number.isFinite(Number(evidence?.roundedValue))
        && Number.isFinite(Number(slot?.val))
        && Number(evidence.roundedValue) !== Number(slot.val)),
    "short-series-primary-value-conflict",
  );
  addReason(
    reasons,
    slot?.boundaryObservation !== null && slot?.boundaryObservation !== undefined,
    "short-series-boundary-observation",
  );
  addReason(
    reasons,
    slot?.valueConstraint !== null && slot?.valueConstraint !== undefined,
    "short-series-value-constraint",
  );
  addReason(
    reasons,
    !Number.isFinite(endpointLocalY)
      || !Number.isFinite(plotTopY)
      || !Number.isFinite(plotBottomY)
      || !Number.isFinite(boundaryMargin)
      || endpointLocalY - plotTopY <= boundaryMargin
      || plotBottomY - endpointLocalY <= boundaryMargin,
    "short-series-endpoint-near-boundary",
  );

  return {
    accepted: reasons.length === 0,
    reasonCodes: reasons,
    consensusValue: Number.isFinite(Number(evidence?.roundedValue))
      ? Number(evidence.roundedValue)
      : null,
  };
}

function validateMachineEvidence(slot, match) {
  const reasons = [];
  const resolvedNumber = normalizeMachineNumber(match?.resolvedNum ?? match?.num);
  const graphNumber = normalizeMachineNumber(
    slot?.machineNumberOcr?.candidate
      ?? slot?.machineNumberCandidate
      ?? slot?.machineNumber,
  );
  const tableNumber = normalizeMachineNumber(match?.tableRow?.num);

  addReason(reasons, match?.accepted !== true, "short-series-joint-match-missing");
  addReason(
    reasons,
    !TRUSTED_NUMBER_MATCH_TYPES.has(match?.matchType)
      || !TRUSTED_NUMBER_MATCHED_BY.has(match?.matchedBy),
    "short-series-joint-number-not-exact",
  );
  addReason(reasons, slot?.machineNumberOcr?.accepted !== true, "short-series-graph-number-untrusted");
  addReason(
    reasons,
    !Number.isInteger(slot?.machineNumberOcr?.ensemble?.votes)
      || slot.machineNumberOcr.ensemble.votes < 5,
    "short-series-graph-number-consensus-too-low",
  );
  addReason(reasons, match?.tableRow?.numAccepted !== true, "short-series-table-number-untrusted");
  addReason(
    reasons,
    resolvedNumber === null
      || graphNumber !== resolvedNumber
      || tableNumber !== resolvedNumber,
    "short-series-machine-number-conflict",
  );

  return {
    accepted: reasons.length === 0,
    reasonCodes: reasons,
    machineNumber: resolvedNumber,
  };
}

function validateMaxPayoutEvidence(slot, match) {
  const reasons = [];
  const tableRow = match?.tableRow;
  const tableValue = finiteNonNegativeInteger(tableRow?.maxPayout);
  const graphMetadata = slot?.graphMaxPayout;
  const graphValue = finiteNonNegativeInteger(
    graphMetadata?.value ?? slot?.maxPayout,
  );
  const sortedCandidates = (Array.isArray(graphMetadata?.candidates)
    ? graphMetadata.candidates
    : [])
    .map((candidate) => ({
      value: finiteNonNegativeInteger(candidate?.value),
      score: Number(candidate?.score),
    }))
    .filter((candidate) => candidate.value !== null && Number.isFinite(candidate.score))
    .sort((left, right) => left.score - right.score);
  const best = sortedCandidates[0] || null;
  const runnerUp = sortedCandidates.find((candidate) => candidate.value !== best?.value) || null;
  const candidateGap = best && runnerUp ? runnerUp.score - best.score : null;
  const directlyAccepted = graphMetadata?.accepted === true && graphValue === tableValue;
  const corroboratedLowPayout = graphValue === tableValue
    && best?.value === tableValue
    && best.score <= 0.16
    && Number.isFinite(candidateGap)
    && candidateGap >= 0.05;

  addReason(
    reasons,
    tableRow?.maxPayoutAccepted !== true
      || (tableRow?.fieldAccepted
        && tableRow.fieldAccepted.maxPayout !== true),
    "short-series-table-max-payout-untrusted",
  );
  addReason(
    reasons,
    tableValue === null || graphValue !== tableValue,
    "short-series-max-payout-conflict",
  );
  addReason(
    reasons,
    !directlyAccepted && !corroboratedLowPayout,
    "short-series-graph-max-payout-untrusted",
  );

  return {
    accepted: reasons.length === 0,
    reasonCodes: reasons,
    maxPayout: tableValue,
    evidenceMode: directlyAccepted ? "accepted-exact" : "table-corroborated-best-candidate",
    bestCandidateScore: best?.score ?? null,
    candidateGap,
  };
}

function validateOrderEvidence(slots, graphIndex, matchByGraphIndex) {
  const reasons = [];
  const pageEntries = slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => graphPageKey(slot) === graphPageKey(slots[graphIndex]))
    .sort(compareGraphPosition);
  const position = pageEntries.findIndex((entry) => entry.index === graphIndex);
  const previousEntry = position > 0 ? pageEntries[position - 1] : null;
  const nextEntry = position >= 0 && position + 1 < pageEntries.length
    ? pageEntries[position + 1]
    : null;
  const previousMatch = previousEntry ? matchByGraphIndex.get(previousEntry.index) : null;
  const currentMatch = matchByGraphIndex.get(graphIndex);
  const nextMatch = nextEntry ? matchByGraphIndex.get(nextEntry.index) : null;
  const previousNumber = normalizeMachineNumber(previousMatch?.resolvedNum);
  const currentNumber = normalizeMachineNumber(currentMatch?.resolvedNum);
  const nextNumber = normalizeMachineNumber(nextMatch?.resolvedNum);
  const previousSourceIndex = Number(previousMatch?.tableRow?.sourceIndex);
  const currentSourceIndex = Number(currentMatch?.tableRow?.sourceIndex);
  const nextSourceIndex = Number(nextMatch?.tableRow?.sourceIndex);
  const sameTableSource = Number.isInteger(previousSourceIndex)
    && Number.isInteger(currentSourceIndex)
    && Number.isInteger(nextSourceIndex)
    && previousSourceIndex === currentSourceIndex
    && currentSourceIndex === nextSourceIndex;

  addReason(
    reasons,
    !previousEntry || !nextEntry || previousMatch?.accepted !== true
      || currentMatch?.accepted !== true || nextMatch?.accepted !== true,
    "short-series-order-anchors-missing",
  );
  addReason(
    reasons,
    !Number.isInteger(previousMatch?.tableIndex)
      || !Number.isInteger(currentMatch?.tableIndex)
      || !Number.isInteger(nextMatch?.tableIndex)
      || currentMatch.tableIndex - previousMatch.tableIndex !== 1
      || nextMatch.tableIndex - currentMatch.tableIndex !== 1,
    "short-series-table-order-not-consecutive",
  );
  addReason(reasons, !sameTableSource, "short-series-table-source-conflict");
  addReason(
    reasons,
    previousNumber === null || currentNumber === null || nextNumber === null
      || Number(previousNumber) >= Number(currentNumber)
      || Number(currentNumber) >= Number(nextNumber),
    "short-series-machine-number-order-conflict",
  );

  return {
    accepted: reasons.length === 0,
    reasonCodes: reasons,
    previousNumber,
    nextNumber,
  };
}

export function validateShortSeriesSlot(
  slots,
  graphIndex,
  jointMatch,
) {
  const list = Array.isArray(slots) ? slots : [];
  const slot = list[graphIndex];
  const matches = Array.isArray(jointMatch?.matches) ? jointMatch.matches : [];
  const matchByGraphIndex = new Map(
    matches
      .filter((match) => Number.isInteger(match?.graphIndex))
      .map((match) => [match.graphIndex, match]),
  );
  const match = matchByGraphIndex.get(graphIndex);
  const graph = validateGraphEvidence(slot);
  const machine = validateMachineEvidence(slot, match);
  const payout = validateMaxPayoutEvidence(slot, match);
  const order = validateOrderEvidence(list, graphIndex, matchByGraphIndex);
  const reasonCodes = [...new Set([
    ...graph.reasonCodes,
    ...machine.reasonCodes,
    ...payout.reasonCodes,
    ...order.reasonCodes,
  ])];

  return {
    accepted: reasonCodes.length === 0,
    reasonCodes,
    machineNumber: machine.machineNumber,
    originalValue: Number.isFinite(Number(slot?.val)) ? Number(slot.val) : null,
    validatedValue: graph.consensusValue,
    maxPayout: payout.maxPayout,
    maxPayoutEvidenceMode: payout.evidenceMode,
    maxPayoutBestCandidateScore: payout.bestCandidateScore,
    maxPayoutCandidateGap: payout.candidateGap,
    previousMachineNumber: order.previousNumber,
    nextMachineNumber: order.nextNumber,
    validationSource: "four-threshold-endpoint+joint-number-order+table-max",
  };
}

export function applySafeShortSeriesValidation(slots, jointMatch) {
  const list = Array.isArray(slots) ? slots : [];
  return list.map((slot, graphIndex) => {
    if (slot?.status !== "review"
      || !Array.isArray(slot?.reasonCodes)
      || !slot.reasonCodes.includes("short-series")) return slot;

    const validation = validateShortSeriesSlot(list, graphIndex, jointMatch);
    if (!validation.accepted) {
      return {
        ...slot,
        shortSeriesValidation: validation,
      };
    }
    return {
      ...slot,
      val: validation.validatedValue,
      status: "ok",
      reasonCodes: slot.reasonCodes.filter((reason) => !SAFE_SHORT_SERIES_REASONS.has(reason)),
      machineNumber: validation.machineNumber,
      shortSeriesValidation: validation,
    };
  });
}
