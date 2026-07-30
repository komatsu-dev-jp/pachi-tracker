// A short trace is never accepted from a single permissive pixel threshold.
// Normal promotion requires exact agreement across conservative profiles and
// independent table/graph evidence. One user-approved near-zero approximation
// exists for an exceptionally narrow low-activity signature; every listed
// graph, table, identity, and order condition must match or the slot stays in
// review.

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

const NEAR_ZERO_PROFILE_NAMES = Object.freeze([
  "strict",
  "standard",
  "jpeg-tolerant",
  "faint",
]);

const NEAR_ZERO_ESTIMATED_VALUE = -500;
const NEAR_ZERO_MIN_PROFILE_VALUE = -1500;
const NEAR_ZERO_MAX_PROFILE_VALUE = -500;
const NEAR_ZERO_MAX_PROFILE_SPAN = 13;
const NEAR_ZERO_MAX_PROFILE_SPAN_RATIO = 0.04;
const NEAR_ZERO_MAX_ENDPOINT_DISTANCE_PX = 7;
const NEAR_ZERO_MIN_ENDPOINT_GRID_RATIO = 0.08;
const NEAR_ZERO_MAX_ENDPOINT_GRID_RATIO = 0.16;
const NEAR_ZERO_MAX_PAYOUT = 10;
const NEAR_ZERO_MAX_STARTS = 100;
const NEAR_ZERO_ALLOWED_EVIDENCE_REASONS = new Set([
  "short-series-threshold-value-disagreement",
  "short-series-primary-value-disagreement",
]);
const THREE_OF_FOUR_ALLOWED_EVIDENCE_REASONS = new Set([
  "short-series-threshold-value-disagreement",
]);
const THREE_OF_FOUR_MAX_ROUNDED_VALUE_SPREAD = 500;
const THREE_OF_FOUR_MAX_COMPONENT_SPAN_SPREAD = 2;
const THREE_OF_FOUR_NARROW_COMPONENT_SPAN_SPREAD = 3;

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

function validateNearZeroGraphEvidence(slot) {
  const reasons = [];
  const slotReasons = Array.isArray(slot?.reasonCodes) ? slot.reasonCodes : [];
  const evidence = slot?.shortSeriesEvidence;
  const attempts = Array.isArray(evidence?.attempts) ? evidence.attempts : [];
  const calibration = slot?.calibration;
  const panelWidth = Number(slot?.bbox?.width);
  const zeroY = Number(calibration?.zeroY);
  const plotTopY = Number(calibration?.plotTopY);
  const plotBottomY = Number(calibration?.plotBottomY);
  const gridSpacing = Number(calibration?.gridSpacing);
  const endpointLocalY = Number(evidence?.endpointLocalY);
  const profileNames = attempts.map((attempt) => attempt?.profile);
  const expectedProfilesPresent = attempts.length === NEAR_ZERO_PROFILE_NAMES.length
    && new Set(profileNames).size === NEAR_ZERO_PROFILE_NAMES.length
    && NEAR_ZERO_PROFILE_NAMES.every((name) => profileNames.includes(name));
  const attemptValues = attempts.map((attempt) => Number(attempt?.roundedValue));
  const attemptValueSpread = attemptValues.every(Number.isFinite)
    ? Math.max(...attemptValues) - Math.min(...attemptValues)
    : null;
  const allAttemptValuesNearZeroNegative = attemptValues.length === NEAR_ZERO_PROFILE_NAMES.length
    && attemptValues.every((value) => (
      Number.isFinite(value)
      && value >= NEAR_ZERO_MIN_PROFILE_VALUE
      && value <= NEAR_ZERO_MAX_PROFILE_VALUE
    ));
  const primaryValue = Number(slot?.val);
  const attemptEndpointDistances = attempts.map(
    (attempt) => Number(attempt?.endpointLocalY) - zeroY,
  );
  const attemptEndpointGridRatios = attemptEndpointDistances.map(
    (distance) => distance / gridSpacing,
  );
  const allAttemptEndpointsNearZeroBelow = Number.isFinite(zeroY)
    && Number.isFinite(gridSpacing)
    && gridSpacing > 0
    && attemptEndpointDistances.length === NEAR_ZERO_PROFILE_NAMES.length
    && attemptEndpointDistances.every((distance, index) => (
      Number.isFinite(distance)
      && distance > 0
      && distance <= NEAR_ZERO_MAX_ENDPOINT_DISTANCE_PX
      && Number.isFinite(attemptEndpointGridRatios[index])
      && attemptEndpointGridRatios[index] >= NEAR_ZERO_MIN_ENDPOINT_GRID_RATIO
      && attemptEndpointGridRatios[index] <= NEAR_ZERO_MAX_ENDPOINT_GRID_RATIO
    ));
  const attemptSpans = attempts.map((attempt) => Number(attempt?.span));
  const allAttemptComponentsShort = attempts.length === NEAR_ZERO_PROFILE_NAMES.length
    && Number.isFinite(panelWidth)
    && panelWidth > 0
    && attempts.every((attempt) => (
      Number.isFinite(Number(attempt?.span))
      && Number(attempt.span) >= 1
      && Number(attempt.span) <= NEAR_ZERO_MAX_PROFILE_SPAN
      && Number(attempt.span) / panelWidth <= NEAR_ZERO_MAX_PROFILE_SPAN_RATIO
      && Number.isFinite(Number(attempt?.bounds?.minX))
      && Number.isFinite(Number(attempt?.bounds?.maxX))
    ));
  const endpointBoundaryMargin = Number.isFinite(gridSpacing)
    ? Math.max(2.5, gridSpacing * 0.08)
    : null;

  addReason(reasons, slot?.status !== "review", "near-zero-not-review");
  addReason(reasons, !slotReasons.includes("short-series"), "near-zero-short-series-reason-missing");
  addReason(
    reasons,
    slotReasons.some((reason) => !SAFE_SHORT_SERIES_REASONS.has(reason)),
    "near-zero-has-unsafe-graph-reason",
  );
  addReason(reasons, !Number.isFinite(primaryValue), "near-zero-primary-value-missing");
  addReason(
    reasons,
    !Number.isFinite(primaryValue)
      || primaryValue < NEAR_ZERO_MIN_PROFILE_VALUE
      || primaryValue > NEAR_ZERO_MAX_PROFILE_VALUE,
    "near-zero-primary-value-outside-negative-band",
  );
  addReason(reasons, Number(slot?.confidence) < 0.8, "near-zero-confidence-too-low");
  addReason(reasons, calibration?.source !== "panel", "near-zero-panel-calibration-missing");
  addReason(reasons, Number(calibration?.quality) < 0.95, "near-zero-calibration-too-low");
  addReason(
    reasons,
    !Number.isInteger(evidence?.profileCount)
      || evidence.profileCount !== NEAR_ZERO_PROFILE_NAMES.length
      || evidence.requiredProfileCount !== NEAR_ZERO_PROFILE_NAMES.length
      || !expectedProfilesPresent,
    "near-zero-four-profiles-missing",
  );
  addReason(
    reasons,
    !allAttemptValuesNearZeroNegative,
    "near-zero-profile-values-not-all-negative-near-zero",
  );
  addReason(
    reasons,
    !Number.isFinite(Number(evidence?.roundedValueSpread))
      || Number(evidence.roundedValueSpread) !== 500
      || !Number.isFinite(Number(evidence?.roundedValue))
      || !Number.isFinite(primaryValue)
      || Math.abs(Number(evidence.roundedValue) - primaryValue) !== 500
      || attemptValueSpread !== 500,
    "near-zero-value-spread-too-large",
  );
  addReason(
    reasons,
    evidence?.accepted !== false
      || evidence?.primaryValueAgrees !== false
      || !Array.isArray(evidence?.reasonCodes)
      || evidence.reasonCodes.length !== NEAR_ZERO_ALLOWED_EVIDENCE_REASONS.size
      || [...NEAR_ZERO_ALLOWED_EVIDENCE_REASONS].some(
        (reason) => !evidence.reasonCodes.includes(reason),
      )
      || evidence.reasonCodes.some(
        (reason) => !NEAR_ZERO_ALLOWED_EVIDENCE_REASONS.has(reason),
      ),
    "near-zero-has-unsafe-consensus-reason",
  );
  addReason(
    reasons,
    !allAttemptEndpointsNearZeroBelow,
    "near-zero-profile-endpoints-not-below-zero-nearby",
  );
  addReason(
    reasons,
    !allAttemptComponentsShort,
    "near-zero-profile-components-not-extremely-short",
  );
  addReason(
    reasons,
    !Number.isFinite(Number(evidence?.endpointSpread))
      || !Number.isFinite(Number(evidence?.maximumEndpointSpread))
      || Number(evidence.endpointSpread) > Number(evidence.maximumEndpointSpread),
    "near-zero-endpoint-disagreement",
  );
  addReason(
    reasons,
    Number(evidence?.endpointSpread) > 1.5,
    "near-zero-endpoint-spread-too-large",
  );
  addReason(
    reasons,
    !Number.isFinite(Number(evidence?.startSpread))
      || !Number.isFinite(Number(evidence?.endSpread))
      || Number(evidence.startSpread) > 2
      || Number(evidence.endSpread) > 3
      || !attemptSpans.every(Number.isFinite)
      || Math.max(...attemptSpans) - Math.min(...attemptSpans) > 2,
    "near-zero-component-disagreement",
  );
  addReason(
    reasons,
    !Number.isFinite(endpointLocalY)
      || !Number.isFinite(zeroY)
      || endpointLocalY <= zeroY
      || endpointLocalY - zeroY > NEAR_ZERO_MAX_ENDPOINT_DISTANCE_PX,
    "near-zero-consensus-endpoint-not-below-zero-nearby",
  );
  addReason(
    reasons,
    slot?.boundaryObservation !== null && slot?.boundaryObservation !== undefined,
    "near-zero-boundary-observation",
  );
  addReason(
    reasons,
    slot?.valueConstraint !== null && slot?.valueConstraint !== undefined,
    "near-zero-value-constraint",
  );
  addReason(
    reasons,
    !Number.isFinite(plotTopY)
      || !Number.isFinite(plotBottomY)
      || !Number.isFinite(endpointBoundaryMargin)
      || endpointLocalY - plotTopY <= endpointBoundaryMargin
      || plotBottomY - endpointLocalY <= endpointBoundaryMargin,
    "near-zero-endpoint-near-panel-boundary",
  );

  return {
    accepted: reasons.length === 0,
    reasonCodes: reasons,
    primaryValue: Number.isFinite(primaryValue) ? primaryValue : null,
    profileValues: attemptValues.every(Number.isFinite) ? attemptValues : [],
    maximumProfileSpanRatio: allAttemptComponentsShort
      ? Math.max(...attemptSpans) / panelWidth
      : null,
    maximumProfileSpan: attempts.length
      ? Math.max(...attempts.map((attempt) => Number(attempt?.span)))
      : null,
    maximumEndpointDistancePx: attemptEndpointDistances.every(Number.isFinite)
      ? Math.max(...attemptEndpointDistances)
      : null,
  };
}

function validateThreeOfFourGraphEvidence(slot) {
  const reasons = [];
  const slotReasons = Array.isArray(slot?.reasonCodes) ? slot.reasonCodes : [];
  const evidence = slot?.shortSeriesEvidence;
  const attempts = Array.isArray(evidence?.attempts) ? evidence.attempts : [];
  const calibration = slot?.calibration;
  const primaryValue = Number(slot?.val);
  const profileNames = attempts.map((attempt) => attempt?.profile);
  const expectedProfilesPresent = attempts.length === NEAR_ZERO_PROFILE_NAMES.length
    && new Set(profileNames).size === NEAR_ZERO_PROFILE_NAMES.length
    && NEAR_ZERO_PROFILE_NAMES.every((name) => profileNames.includes(name));
  const profileValues = attempts.map((attempt) => Number(attempt?.roundedValue));
  const valueCounts = new Map();
  for (const value of profileValues) {
    if (!Number.isFinite(value)) continue;
    valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
  }
  const majorityEntry = [...valueCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])[0] || null;
  const majorityValue = majorityEntry?.[0] ?? null;
  const majorityCount = majorityEntry?.[1] ?? 0;
  const derivedValueSpread = profileValues.length === NEAR_ZERO_PROFILE_NAMES.length
    && profileValues.every(Number.isFinite)
    ? Math.max(...profileValues) - Math.min(...profileValues)
    : null;
  const endpointValues = attempts.map((attempt) => Number(attempt?.endpointLocalY));
  const startValues = attempts.map((attempt) => Number(attempt?.bounds?.minX));
  const endValues = attempts.map((attempt) => Number(attempt?.bounds?.maxX));
  const spanValues = attempts.map((attempt) => Number(attempt?.span));
  const spread = (values) => (
    values.length === NEAR_ZERO_PROFILE_NAMES.length && values.every(Number.isFinite)
      ? Math.max(...values) - Math.min(...values)
      : null
  );
  const derivedEndpointSpread = spread(endpointValues);
  const derivedStartSpread = spread(startValues);
  const derivedEndSpread = spread(endValues);
  const derivedComponentSpanSpread = spread(spanValues);
  const componentSpansMatchBounds = attempts.length === NEAR_ZERO_PROFILE_NAMES.length
    && attempts.every((attempt) => (
      Number.isFinite(Number(attempt?.span))
      && Number.isFinite(Number(attempt?.bounds?.minX))
      && Number.isFinite(Number(attempt?.bounds?.maxX))
      && Number(attempt.span)
        === Number(attempt.bounds.maxX) - Number(attempt.bounds.minX) + 1
    ));
  // A three-pixel span difference can be produced by the already-accepted
  // one-pixel start and two-pixel end shifts moving in opposite directions.
  // Permit that exact geometry only when endpoint agreement is even tighter;
  // larger or internally inconsistent component differences still fail closed.
  const componentSpanSpreadAccepted = Number.isFinite(derivedComponentSpanSpread)
    && (
      derivedComponentSpanSpread <= THREE_OF_FOUR_MAX_COMPONENT_SPAN_SPREAD
      || (
        derivedComponentSpanSpread <= THREE_OF_FOUR_NARROW_COMPONENT_SPAN_SPREAD
        && Number.isFinite(derivedEndpointSpread)
        && Number.isFinite(derivedStartSpread)
        && Number.isFinite(derivedEndSpread)
        && derivedEndpointSpread <= 1
        && derivedStartSpread <= 1
        && derivedEndSpread <= 2
      )
    );
  const maximumEndpointSpread = Number(evidence?.maximumEndpointSpread);
  const endpointSpread = Number(evidence?.endpointSpread);
  const startSpread = Number(evidence?.startSpread);
  const endSpread = Number(evidence?.endSpread);
  const roundedValueSpread = Number(evidence?.roundedValueSpread);
  const endpointLocalY = Number(evidence?.endpointLocalY);
  const plotTopY = Number(calibration?.plotTopY);
  const plotBottomY = Number(calibration?.plotBottomY);
  const gridSpacing = Number(calibration?.gridSpacing);
  const boundaryMargin = Number.isFinite(gridSpacing)
    ? Math.max(2.5, gridSpacing * 0.08)
    : null;

  addReason(reasons, slot?.status !== "review", "three-of-four-not-review");
  addReason(
    reasons,
    !slotReasons.includes("short-series"),
    "three-of-four-short-series-reason-missing",
  );
  addReason(
    reasons,
    slotReasons.some((reason) => !SAFE_SHORT_SERIES_REASONS.has(reason)),
    "three-of-four-has-unsafe-graph-reason",
  );
  addReason(reasons, !Number.isFinite(primaryValue), "three-of-four-primary-value-missing");
  addReason(reasons, Number(slot?.confidence) < 0.8, "three-of-four-confidence-too-low");
  addReason(reasons, calibration?.source !== "panel", "three-of-four-panel-calibration-missing");
  addReason(reasons, Number(calibration?.quality) < 0.7, "three-of-four-calibration-too-low");
  addReason(
    reasons,
    !Number.isInteger(evidence?.profileCount)
      || evidence.profileCount !== NEAR_ZERO_PROFILE_NAMES.length
      || evidence.requiredProfileCount !== NEAR_ZERO_PROFILE_NAMES.length
      || !expectedProfilesPresent,
    "three-of-four-named-profiles-missing",
  );
  addReason(
    reasons,
    evidence?.accepted !== false
      || !Array.isArray(evidence?.reasonCodes)
      || evidence.reasonCodes.length !== THREE_OF_FOUR_ALLOWED_EVIDENCE_REASONS.size
      || [...THREE_OF_FOUR_ALLOWED_EVIDENCE_REASONS].some(
        (reason) => !evidence.reasonCodes.includes(reason),
      )
      || evidence.reasonCodes.some(
        (reason) => !THREE_OF_FOUR_ALLOWED_EVIDENCE_REASONS.has(reason),
      ),
    "three-of-four-has-unsafe-consensus-reason",
  );
  addReason(
    reasons,
    majorityCount < 3
      || !Number.isFinite(majorityValue)
      || !Number.isFinite(primaryValue)
      || majorityValue !== primaryValue
      || evidence?.primaryValueAgrees !== true
      || Number(evidence?.roundedValue) !== primaryValue,
    "three-of-four-primary-majority-missing",
  );
  addReason(
    reasons,
    !Number.isFinite(roundedValueSpread)
      || !Number.isFinite(derivedValueSpread)
      || roundedValueSpread !== derivedValueSpread
      || derivedValueSpread <= 0
      || derivedValueSpread > THREE_OF_FOUR_MAX_ROUNDED_VALUE_SPREAD,
    "three-of-four-rounded-value-spread-too-large",
  );
  addReason(
    reasons,
    !Number.isFinite(maximumEndpointSpread)
      || !Number.isFinite(endpointSpread)
      || !Number.isFinite(derivedEndpointSpread)
      || endpointSpread > maximumEndpointSpread
      || derivedEndpointSpread > maximumEndpointSpread,
    "three-of-four-endpoint-disagreement",
  );
  addReason(
    reasons,
    !Number.isFinite(startSpread)
      || !Number.isFinite(endSpread)
      || !Number.isFinite(derivedStartSpread)
      || !Number.isFinite(derivedEndSpread)
      || !Number.isFinite(derivedComponentSpanSpread)
      || !componentSpansMatchBounds
      || startSpread > 2
      || derivedStartSpread > 2
      || endSpread > 3
      || derivedEndSpread > 3
      || !componentSpanSpreadAccepted,
    "three-of-four-component-disagreement",
  );
  addReason(
    reasons,
    slot?.boundaryObservation !== null && slot?.boundaryObservation !== undefined,
    "three-of-four-boundary-observation",
  );
  addReason(
    reasons,
    slot?.valueConstraint !== null && slot?.valueConstraint !== undefined,
    "three-of-four-value-constraint",
  );
  addReason(
    reasons,
    !Number.isFinite(endpointLocalY)
      || !Number.isFinite(plotTopY)
      || !Number.isFinite(plotBottomY)
      || !Number.isFinite(boundaryMargin)
      || endpointLocalY - plotTopY <= boundaryMargin
      || plotBottomY - endpointLocalY <= boundaryMargin,
    "three-of-four-endpoint-near-boundary",
  );

  return {
    accepted: reasons.length === 0,
    reasonCodes: reasons,
    primaryValue: Number.isFinite(primaryValue) ? primaryValue : null,
    majorityValue: Number.isFinite(majorityValue) ? majorityValue : null,
    majorityCount,
    profileValues: profileValues.every(Number.isFinite) ? profileValues : [],
    roundedValueSpread: Number.isFinite(derivedValueSpread) ? derivedValueSpread : null,
    endpointSpread: Number.isFinite(derivedEndpointSpread) ? derivedEndpointSpread : null,
    startSpread: Number.isFinite(derivedStartSpread) ? derivedStartSpread : null,
    endSpread: Number.isFinite(derivedEndSpread) ? derivedEndSpread : null,
    componentSpanSpread: Number.isFinite(derivedComponentSpanSpread)
      ? derivedComponentSpanSpread
      : null,
  };
}

function validateNearZeroTableEvidence(match) {
  const reasons = [];
  const tableRow = match?.tableRow;
  const cumulativeStarts = finiteNonNegativeInteger(tableRow?.cumulativeStarts);
  const normalSpins = finiteNonNegativeInteger(tableRow?.normalSpins);
  const firstHitCount = finiteNonNegativeInteger(tableRow?.firstHitCount);
  const maxPayout = finiteNonNegativeInteger(tableRow?.maxPayout);
  const totalStarts = finiteNonNegativeInteger(tableRow?.totalStarts);

  addReason(
    reasons,
    cumulativeStarts === null
      || cumulativeStarts < 1
      || cumulativeStarts > NEAR_ZERO_MAX_STARTS,
    "near-zero-table-cumulative-starts-too-large",
  );
  addReason(
    reasons,
    normalSpins === null
      || normalSpins < 1
      || normalSpins > NEAR_ZERO_MAX_STARTS,
    "near-zero-table-normal-spins-too-large",
  );
  addReason(
    reasons,
    cumulativeStarts === null
      || normalSpins === null
      || cumulativeStarts !== normalSpins,
    "near-zero-table-start-counts-differ",
  );
  addReason(
    reasons,
    tableRow?.fieldAccepted?.cumulativeStarts !== true
      || tableRow?.fieldAccepted?.normalSpins !== true
      || tableRow?.fieldAccepted?.firstHitCount !== true
      || tableRow?.fieldAccepted?.totalStarts !== true
      || tableRow?.fieldAccepted?.maxPayout !== true,
    "near-zero-table-start-counts-untrusted",
  );
  addReason(
    reasons,
    firstHitCount !== 0,
    "near-zero-table-first-hit-not-zero",
  );
  addReason(
    reasons,
    tableRow?.fieldAccepted?.firstHitCount !== true,
    "near-zero-table-first-hit-untrusted",
  );
  addReason(
    reasons,
    totalStarts !== 0,
    "near-zero-table-total-starts-not-zero",
  );
  addReason(
    reasons,
    maxPayout !== NEAR_ZERO_MAX_PAYOUT,
    "near-zero-table-max-payout-not-minimum",
  );
  addReason(
    reasons,
    tableRow?.maxPayoutAccepted !== true
      || tableRow?.fieldAccepted?.maxPayout !== true,
    "near-zero-table-max-payout-untrusted",
  );

  return {
    accepted: reasons.length === 0,
    reasonCodes: reasons,
    cumulativeStarts,
    normalSpins,
    firstHitCount,
    totalStarts,
    maxPayout,
  };
}

export function validateNearZeroShortSeriesEstimate(
  slots,
  graphIndex,
  jointMatch,
) {
  const list = Array.isArray(slots) ? slots : [];
  const matches = Array.isArray(jointMatch?.matches) ? jointMatch.matches : [];
  const matchByGraphIndex = new Map(
    matches
      .filter((match) => Number.isInteger(match?.graphIndex))
      .map((match) => [match.graphIndex, match]),
  );
  const slot = list[graphIndex];
  const match = matchByGraphIndex.get(graphIndex);
  const graph = validateNearZeroGraphEvidence(slot);
  const machine = validateMachineEvidence(slot, match);
  const payout = validateMaxPayoutEvidence(slot, match);
  const table = validateNearZeroTableEvidence(match);
  const order = validateOrderEvidence(list, graphIndex, matchByGraphIndex);
  const reasonCodes = [...new Set([
    ...graph.reasonCodes,
    ...machine.reasonCodes,
    ...payout.reasonCodes,
    ...table.reasonCodes,
    ...order.reasonCodes,
  ])];

  return {
    accepted: reasonCodes.length === 0,
    reasonCodes,
    estimated: true,
    machineNumber: machine.machineNumber,
    originalValue: Number.isFinite(Number(slot?.val)) ? Number(slot.val) : null,
    validatedValue: NEAR_ZERO_ESTIMATED_VALUE,
    cumulativeStarts: table.cumulativeStarts,
    normalSpins: table.normalSpins,
    firstHitCount: table.firstHitCount,
    totalStarts: table.totalStarts,
    maxPayout: table.maxPayout,
    maxPayoutEvidenceMode: payout.evidenceMode,
    maxPayoutBestCandidateScore: payout.bestCandidateScore,
    maxPayoutCandidateGap: payout.candidateGap,
    previousMachineNumber: order.previousNumber,
    nextMachineNumber: order.nextNumber,
    profileValues: graph.profileValues,
    maximumProfileSpan: graph.maximumProfileSpan,
    maximumProfileSpanRatio: graph.maximumProfileSpanRatio,
    maximumEndpointDistancePx: graph.maximumEndpointDistancePx,
    estimationReasonCodes: [
      "four-profiles-negative-and-near-zero",
      "extremely-short-component-consensus",
      "exact-machine-number-and-order",
      "zero-first-hit-and-low-max-payout",
    ],
    validationSource: "user-approved-near-zero-low-activity-approximation",
  };
}

export function validateThreeOfFourShortSeriesConsensus(
  slots,
  graphIndex,
  jointMatch,
) {
  const list = Array.isArray(slots) ? slots : [];
  const matches = Array.isArray(jointMatch?.matches) ? jointMatch.matches : [];
  const matchByGraphIndex = new Map(
    matches
      .filter((match) => Number.isInteger(match?.graphIndex))
      .map((match) => [match.graphIndex, match]),
  );
  const slot = list[graphIndex];
  const match = matchByGraphIndex.get(graphIndex);
  const graph = validateThreeOfFourGraphEvidence(slot);
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
    estimated: true,
    machineNumber: machine.machineNumber,
    originalValue: Number.isFinite(Number(slot?.val)) ? Number(slot.val) : null,
    validatedValue: graph.majorityValue,
    maxPayout: payout.maxPayout,
    maxPayoutEvidenceMode: payout.evidenceMode,
    maxPayoutBestCandidateScore: payout.bestCandidateScore,
    maxPayoutCandidateGap: payout.candidateGap,
    previousMachineNumber: order.previousNumber,
    nextMachineNumber: order.nextNumber,
    profileValues: graph.profileValues,
    majorityValue: graph.majorityValue,
    majorityCount: graph.majorityCount,
    roundedValueSpread: graph.roundedValueSpread,
    endpointSpread: graph.endpointSpread,
    startSpread: graph.startSpread,
    endSpread: graph.endSpread,
    componentSpanSpread: graph.componentSpanSpread,
    estimationReasonCodes: [
      "three-of-four-named-profiles-share-primary-rounded-value",
      "single-profile-rounding-boundary-outlier-within-500",
      "tight-endpoint-and-component-consensus",
      "exact-machine-number-order-and-table-max",
    ],
    validationSource: "three-of-four-rounded-consensus+joint-number-order+table-max",
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
      const threeOfFourConsensus = validateThreeOfFourShortSeriesConsensus(
        list,
        graphIndex,
        jointMatch,
      );
      if (threeOfFourConsensus.accepted) {
        return {
          ...slot,
          val: threeOfFourConsensus.validatedValue,
          status: "ok",
          estimated: true,
          reasonCodes: slot.reasonCodes.filter(
            (reason) => !SAFE_SHORT_SERIES_REASONS.has(reason),
          ),
          machineNumber: threeOfFourConsensus.machineNumber,
          shortSeriesValidation: {
            ...threeOfFourConsensus,
            standardValidationReasonCodes: validation.reasonCodes,
          },
        };
      }
      const nearZeroEstimate = validateNearZeroShortSeriesEstimate(
        list,
        graphIndex,
        jointMatch,
      );
      if (nearZeroEstimate.accepted) {
        return {
          ...slot,
          val: nearZeroEstimate.validatedValue,
          status: "ok",
          estimated: true,
          reasonCodes: slot.reasonCodes.filter(
            (reason) => !SAFE_SHORT_SERIES_REASONS.has(reason),
          ),
          machineNumber: nearZeroEstimate.machineNumber,
          shortSeriesValidation: {
            ...nearZeroEstimate,
            standardValidationReasonCodes: validation.reasonCodes,
            threeOfFourValidationReasonCodes: threeOfFourConsensus.reasonCodes,
          },
        };
      }
      return {
        ...slot,
        shortSeriesValidation: {
          ...validation,
          threeOfFourConsensus,
          nearZeroEstimate,
        },
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
