// Site Seven table row alignment.
//
// OCR values are evidence, not row identifiers. This module aligns the visual
// top-to-bottom row sequence to the store/island machine-number sequence with a
// semi-global dynamic programme. Missing and extra detected rows therefore do
// not shift every row that follows them.

const DEFAULT_OPTIONS = Object.freeze({
  extraObservedRowPenalty: 3.5,
  missingExpectedRowPenalty: 2.75,
  matchBaseScore: 2,
  // A lower margin still produces a suggested expected number, but it is not
  // auto-confirmed. Five points keeps a cancelled missing+extra region (the
  // classic source of a temporary one-row shift) in the review queue.
  stableMargin: 5,
  minimumAnchorConfidence: 0.25,
  maximumMatrixCells: 2_000_000,
});

const OP_NONE = 0;
const OP_MATCH = 1;
const OP_SKIP_OBSERVED = 2;
const OP_SKIP_EXPECTED = 3;
const EPSILON = 1e-9;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function normalizeMachineNumber(value) {
  const text = String(value ?? "").trim().replaceAll(",", "");
  if (!/^\d+$/u.test(text)) return "";
  const number = Number(text);
  return Number.isSafeInteger(number) && number > 0 ? String(number) : "";
}

function normalizeExpectedNumbers(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("expectedNumbers must contain at least one machine number");
  }
  const normalized = values.map(normalizeMachineNumber);
  if (normalized.some((value) => !value)) {
    throw new TypeError("expectedNumbers must contain positive integer machine numbers only");
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError("expectedNumbers must not contain duplicates");
  }
  return normalized;
}

function firstMachineNumber(values) {
  for (const value of values) {
    const normalized = normalizeMachineNumber(value);
    if (normalized) return normalized;
  }
  return "";
}

function candidateValue(candidate) {
  if (candidate && typeof candidate === "object") {
    return firstMachineNumber([
      candidate.value,
      candidate.candidate,
      candidate.num,
      candidate.machineNumber,
    ]);
  }
  return normalizeMachineNumber(candidate);
}

function candidateQuality(candidate, rank) {
  if (!candidate || typeof candidate !== "object") {
    return Math.max(0.2, 0.68 - rank * 0.08);
  }
  const explicitConfidence = Number(candidate.confidence);
  if (Number.isFinite(explicitConfidence)) return clamp(explicitConfidence);
  const score = Number(candidate.score);
  if (Number.isFinite(score)) return clamp(0.78 - score * 1.4 - rank * 0.05, 0.15, 0.78);
  const distance = Number(candidate.distance);
  if (Number.isFinite(distance)) return clamp(0.78 - distance * 1.8 - rank * 0.05, 0.15, 0.78);
  return Math.max(0.2, 0.68 - rank * 0.08);
}

function extractRowEvidence(row) {
  const recognition = row?.machineNumberRecognition
    || row?.machineNumberOcr
    || row?.numOcr
    || {};
  const primary = firstMachineNumber([
    row?.machineNumberCandidate,
    row?.observedNumCandidate,
    row?.num,
    row?.candidate,
    recognition?.candidate,
    recognition?.value,
  ]);
  const confidence = clamp(
    row?.numConfidence
      ?? row?.machineNumberConfidence
      ?? recognition?.confidence
      ?? row?.confidence
      ?? 0,
  );
  const accepted = row?.numAccepted === true
    || row?.machineNumberAccepted === true
    || recognition?.accepted === true;
  const variants = Array.isArray(recognition?.variants)
    ? recognition.variants.map(normalizeMachineNumber).filter(Boolean)
    : [];
  const unanimous = recognition?.unanimous === true
    || (variants.length >= 2 && variants.every((value) => value === variants[0]));
  const rawAlternatives = [
    ...(Array.isArray(row?.numCandidates) ? row.numCandidates : []),
    ...(Array.isArray(row?.machineNumberCandidates) ? row.machineNumberCandidates : []),
    ...(Array.isArray(recognition?.candidates) ? recognition.candidates : []),
    ...variants,
  ];
  const alternatives = [];
  const seen = new Set(primary ? [primary] : []);
  rawAlternatives.forEach((candidate, rank) => {
    const value = candidateValue(candidate);
    if (!value || seen.has(value)) return;
    seen.add(value);
    alternatives.push({
      value,
      quality: candidateQuality(candidate, rank),
      rank,
    });
  });
  return { primary, confidence, accepted, unanimous, variants, alternatives };
}

function levenshteinDistance(left, right) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function evidenceForExpected(evidence, expectedNumber, expectedSet, matchBaseScore) {
  if (evidence.primary === expectedNumber) {
    return {
      score: matchBaseScore
        + 8.5
        + evidence.confidence * 2
        + (evidence.accepted ? 1.5 : 0)
        + (evidence.unanimous ? 0.5 : 0),
      type: "exact-primary",
      editDistance: 0,
      candidateRank: 0,
    };
  }
  const alternative = evidence.alternatives.find(({ value }) => value === expectedNumber);
  if (alternative) {
    return {
      score: matchBaseScore + 3.5 + alternative.quality * 3,
      type: "exact-alternative",
      editDistance: 0,
      candidateRank: alternative.rank + 1,
    };
  }
  if (!evidence.primary) {
    return {
      score: matchBaseScore,
      type: "sequence-only",
      editDistance: null,
      candidateRank: null,
    };
  }
  const distance = levenshteinDistance(evidence.primary, expectedNumber);
  const primaryConflictsWithKnownNumber = expectedSet.has(evidence.primary);
  const nearDigitBonus = distance === 1
    ? 0.65
    : distance === 2 && evidence.primary.length === expectedNumber.length
      ? 0.15
      : 0;
  const conflictPenalty = primaryConflictsWithKnownNumber
    ? 2.2 * (0.5 + evidence.confidence * 0.5)
    : 0.45 * evidence.confidence;
  return {
    score: matchBaseScore + nearDigitBonus - conflictPenalty,
    type: distance <= 1 ? "near-primary" : "sequence-only",
    editDistance: distance,
    candidateRank: null,
  };
}

function allocateScoreMatrix(rowCount, columnCount, initialValue = Number.NEGATIVE_INFINITY) {
  return Array.from({ length: rowCount }, () => {
    const row = new Float64Array(columnCount);
    row.fill(initialValue);
    return row;
  });
}

function forwardAlignment(emissionScores, options) {
  const observedCount = emissionScores.length;
  const expectedCount = emissionScores[0]?.length || 0;
  const scores = allocateScoreMatrix(observedCount + 1, expectedCount + 1);
  const trace = Array.from(
    { length: observedCount + 1 },
    () => new Uint8Array(expectedCount + 1),
  );
  // Expected rows before the first photographed row are free. This is what
  // permits a partial screenshot to start in the middle of an island.
  for (let expectedIndex = 0; expectedIndex <= expectedCount; expectedIndex += 1) {
    scores[0][expectedIndex] = 0;
    if (expectedIndex > 0) trace[0][expectedIndex] = OP_SKIP_EXPECTED;
  }
  for (let observedIndex = 1; observedIndex <= observedCount; observedIndex += 1) {
    scores[observedIndex][0] = scores[observedIndex - 1][0]
      - options.extraObservedRowPenalty;
    trace[observedIndex][0] = OP_SKIP_OBSERVED;
  }
  for (let observedIndex = 1; observedIndex <= observedCount; observedIndex += 1) {
    for (let expectedIndex = 1; expectedIndex <= expectedCount; expectedIndex += 1) {
      // Match wins ties. It makes the deterministic display intuitive, while
      // the path-margin calculation below still marks a tied position review.
      let bestScore = scores[observedIndex - 1][expectedIndex - 1]
        + emissionScores[observedIndex - 1][expectedIndex - 1];
      let operation = OP_MATCH;
      const skipExpected = scores[observedIndex][expectedIndex - 1]
        - options.missingExpectedRowPenalty;
      if (skipExpected > bestScore + EPSILON) {
        bestScore = skipExpected;
        operation = OP_SKIP_EXPECTED;
      }
      const skipObserved = scores[observedIndex - 1][expectedIndex]
        - options.extraObservedRowPenalty;
      if (skipObserved > bestScore + EPSILON) {
        bestScore = skipObserved;
        operation = OP_SKIP_OBSERVED;
      }
      scores[observedIndex][expectedIndex] = bestScore;
      trace[observedIndex][expectedIndex] = operation;
    }
  }
  let endExpectedIndex = 0;
  let bestScore = scores[observedCount][0];
  for (let expectedIndex = 1; expectedIndex <= expectedCount; expectedIndex += 1) {
    const score = scores[observedCount][expectedIndex];
    if (score > bestScore + EPSILON) {
      bestScore = score;
      endExpectedIndex = expectedIndex;
    }
  }
  return { scores, trace, bestScore, endExpectedIndex };
}

function backwardAlignment(emissionScores, options) {
  const observedCount = emissionScores.length;
  const expectedCount = emissionScores[0]?.length || 0;
  const scores = allocateScoreMatrix(observedCount + 1, expectedCount + 1);
  // Expected rows after the last photographed row are free.
  for (let expectedIndex = 0; expectedIndex <= expectedCount; expectedIndex += 1) {
    scores[observedCount][expectedIndex] = 0;
  }
  for (let observedIndex = observedCount - 1; observedIndex >= 0; observedIndex -= 1) {
    scores[observedIndex][expectedCount] = scores[observedIndex + 1][expectedCount]
      - options.extraObservedRowPenalty;
    for (let expectedIndex = expectedCount - 1; expectedIndex >= 0; expectedIndex -= 1) {
      scores[observedIndex][expectedIndex] = Math.max(
        emissionScores[observedIndex][expectedIndex]
          + scores[observedIndex + 1][expectedIndex + 1],
        scores[observedIndex + 1][expectedIndex] - options.extraObservedRowPenalty,
        scores[observedIndex][expectedIndex + 1] - options.missingExpectedRowPenalty,
      );
    }
  }
  return scores;
}

function backtrackRows(trace, observedCount, endExpectedIndex) {
  const expectedByObserved = new Array(observedCount).fill(null);
  let observedIndex = observedCount;
  let expectedIndex = endExpectedIndex;
  while (observedIndex > 0) {
    const operation = trace[observedIndex]?.[expectedIndex] || OP_SKIP_OBSERVED;
    if (operation === OP_MATCH && expectedIndex > 0) {
      expectedByObserved[observedIndex - 1] = expectedIndex - 1;
      observedIndex -= 1;
      expectedIndex -= 1;
    } else if (operation === OP_SKIP_EXPECTED && expectedIndex > 0) {
      expectedIndex -= 1;
    } else {
      observedIndex -= 1;
    }
  }
  return expectedByObserved;
}

function assignmentMargin({
  observedIndex,
  selectedExpectedIndex,
  emissionScores,
  forwardScores,
  backwardScores,
  globalScore,
  options,
}) {
  const expectedCount = emissionScores[observedIndex]?.length || 0;
  let bestAlternative = Number.NEGATIVE_INFINITY;
  for (let expectedIndex = 0; expectedIndex < expectedCount; expectedIndex += 1) {
    if (expectedIndex === selectedExpectedIndex) continue;
    const score = forwardScores[observedIndex][expectedIndex]
      + emissionScores[observedIndex][expectedIndex]
      + backwardScores[observedIndex + 1][expectedIndex + 1];
    bestAlternative = Math.max(bestAlternative, score);
  }
  // Also compare with every legal path on which this detected row is ignored.
  for (let expectedIndex = 0; expectedIndex <= expectedCount; expectedIndex += 1) {
    const score = forwardScores[observedIndex][expectedIndex]
      - options.extraObservedRowPenalty
      + backwardScores[observedIndex + 1][expectedIndex];
    bestAlternative = Math.max(bestAlternative, score);
  }
  if (!Number.isFinite(bestAlternative)) return Number.POSITIVE_INFINITY;
  return Math.max(0, globalScore - bestAlternative);
}

function contiguousAssignmentRuns(assignments) {
  const runs = [];
  let current = [];
  for (const assignment of assignments) {
    if (assignment.expectedIndex === null) {
      if (current.length) runs.push(current);
      current = [];
      continue;
    }
    const previous = current[current.length - 1];
    if (previous && (
      assignment.rowIndex !== previous.rowIndex + 1
      || assignment.expectedIndex !== previous.expectedIndex + 1
    )) {
      runs.push(current);
      current = [];
    }
    current.push(assignment);
  }
  if (current.length) runs.push(current);
  return runs;
}

function confidenceForAssignment({ evidenceType, ocrConfidence, margin, sequenceTrusted }) {
  const stability = clamp(margin / 6);
  if (evidenceType === "exact-primary" && sequenceTrusted) {
    return clamp(0.76 + ocrConfidence * 0.14 + stability * 0.1);
  }
  if (evidenceType === "exact-primary") {
    return clamp(0.58 + ocrConfidence * 0.27 + stability * 0.15);
  }
  if (sequenceTrusted) return clamp(0.72 + stability * 0.23);
  if (evidenceType === "exact-alternative") return clamp(0.42 + stability * 0.28);
  return clamp(0.12 + stability * 0.43);
}

/**
 * Align top-to-bottom OCR rows to an ordered store/island machine-number list.
 *
 * The returned rowAssignments always has the same length as rawRows. The
 * expectedAssignments array is in fixed CSV order and always has the same
 * length as expectedNumbers. `accepted` is deliberately stricter than merely
 * having a suggested number: uncertain placement remains visible as review.
 */
export function alignSiteSevenTableRows(rawRows, expectedNumbers, rawOptions = {}) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const expected = normalizeExpectedNumbers(expectedNumbers);
  const options = { ...DEFAULT_OPTIONS, ...rawOptions };
  if ((rows.length + 1) * (expected.length + 1) > options.maximumMatrixCells) {
    throw new RangeError("table row alignment is too large");
  }
  const expectedSet = new Set(expected);
  const rowEvidence = rows.map(extractRowEvidence);
  const primaryCounts = new Map();
  rowEvidence.forEach(({ primary }) => {
    if (primary) primaryCounts.set(primary, (primaryCounts.get(primary) || 0) + 1);
  });
  const evidenceMatrix = rowEvidence.map((evidence) => expected.map((number) => (
    evidenceForExpected(evidence, number, expectedSet, options.matchBaseScore)
  )));
  const emissionScores = evidenceMatrix.map((row) => Float64Array.from(
    row.map(({ score }) => score),
  ));
  const forward = forwardAlignment(emissionScores, options);
  const backwardScores = backwardAlignment(emissionScores, options);
  const expectedByObserved = backtrackRows(
    forward.trace,
    rows.length,
    forward.endExpectedIndex,
  );

  const rowAssignments = rows.map((_, rowIndex) => {
    const expectedIndex = expectedByObserved[rowIndex];
    const evidence = rowEvidence[rowIndex];
    if (!Number.isInteger(expectedIndex)) {
      return {
        rowIndex,
        expectedIndex: null,
        expectedNumber: "",
        observedCandidate: evidence.primary,
        accepted: false,
        reviewRequired: true,
        confidence: 0,
        alignmentConfidence: 0,
        pathMargin: 0,
        evidenceType: "unmatched-observed-row",
        reasonCodes: ["unexpected-observed-row"],
      };
    }
    const expectedNumber = expected[expectedIndex];
    const matchEvidence = evidenceMatrix[rowIndex][expectedIndex];
    const margin = assignmentMargin({
      observedIndex: rowIndex,
      selectedExpectedIndex: expectedIndex,
      emissionScores,
      forwardScores: forward.scores,
      backwardScores,
      globalScore: forward.bestScore,
      options,
    });
    return {
      rowIndex,
      expectedIndex,
      expectedNumber,
      observedCandidate: evidence.primary,
      observedCandidateInExpectedSet: expectedSet.has(evidence.primary),
      ocrConfidence: evidence.confidence,
      rawOcrAccepted: evidence.accepted,
      duplicateObservedCandidate: Boolean(
        evidence.primary && (primaryCounts.get(evidence.primary) || 0) > 1
      ),
      accepted: false,
      reviewRequired: true,
      confidence: 0,
      alignmentConfidence: 0,
      pathMargin: Number.isFinite(margin) ? margin : 999,
      evidenceType: matchEvidence.type,
      candidateRank: matchEvidence.candidateRank,
      editDistance: matchEvidence.editDistance,
      reasonCodes: [],
    };
  });

  const runs = contiguousAssignmentRuns(rowAssignments);
  for (const run of runs) {
    const anchors = run.filter((assignment) => {
      if (assignment.evidenceType !== "exact-primary") return false;
      if (assignment.duplicateObservedCandidate) return false;
      if (assignment.pathMargin + EPSILON < options.stableMargin) return false;
      return assignment.rawOcrAccepted
        || assignment.ocrConfidence >= options.minimumAnchorConfidence;
    });
    const sequenceTrusted = anchors.length >= 2;
    for (const assignment of run) {
      const exactUniqueStable = assignment.evidenceType === "exact-primary"
        && !assignment.duplicateObservedCandidate
        && assignment.pathMargin + EPSILON >= options.stableMargin
        && (assignment.rawOcrAccepted
          || assignment.ocrConfidence >= options.minimumAnchorConfidence);
      const highConfidencePrimaryConflict = Boolean(assignment.observedCandidate)
        && assignment.observedCandidate !== assignment.expectedNumber
        && assignment.ocrConfidence >= 0.5
        && (assignment.rawOcrAccepted || !assignment.observedCandidateInExpectedSet);
      const duplicateCandidateConflict = assignment.duplicateObservedCandidate
        && assignment.observedCandidate !== assignment.expectedNumber;
      const candidateCanBeSafelyOverridden = !duplicateCandidateConflict
        && !highConfidencePrimaryConflict && (
        !assignment.observedCandidate
        || assignment.observedCandidateInExpectedSet
        || assignment.evidenceType === "exact-alternative"
        || assignment.evidenceType === "near-primary"
      );
      const stableSequence = sequenceTrusted
        && candidateCanBeSafelyOverridden
        && assignment.pathMargin + EPSILON >= options.stableMargin;
      assignment.accepted = exactUniqueStable || stableSequence;
      assignment.reviewRequired = !assignment.accepted;
      assignment.alignmentConfidence = confidenceForAssignment({
        evidenceType: assignment.evidenceType,
        ocrConfidence: assignment.ocrConfidence,
        margin: assignment.pathMargin,
        sequenceTrusted: stableSequence,
      });
      assignment.confidence = assignment.alignmentConfidence;
      const reasons = [];
      if (exactUniqueStable) reasons.push("exact-ocr-anchor");
      else if (stableSequence) reasons.push("sequence-aligned");
      if (assignment.duplicateObservedCandidate) {
        reasons.push(stableSequence
          ? "duplicate-ocr-candidate-resolved"
          : "duplicate-ocr-candidate");
      }
      if (!assignment.observedCandidate) reasons.push("machine-number-unreadable");
      else if (assignment.observedCandidate !== assignment.expectedNumber) {
        reasons.push(stableSequence
          ? "ocr-candidate-overridden"
          : "ocr-candidate-conflict");
      } else if (assignment.evidenceType === "exact-alternative") {
        reasons.push("ocr-alternative-selected");
      }
      if (assignment.observedCandidate
        && !assignment.observedCandidateInExpectedSet
        && assignment.evidenceType === "sequence-only") {
        reasons.push("out-of-scope-ocr-candidate");
      }
      if (highConfidencePrimaryConflict) {
        reasons.push("high-confidence-ocr-conflict");
      }
      if (assignment.pathMargin + EPSILON < options.stableMargin) {
        reasons.push("ambiguous-alignment");
      }
      if (!assignment.accepted && anchors.length < 2 && !exactUniqueStable) {
        reasons.push("insufficient-anchor-evidence");
      }
      if (!assignment.accepted && reasons.length === 0) reasons.push("manual-review-required");
      assignment.reasonCodes = [...new Set(reasons)];
      assignment.sequenceAnchorRowIndices = anchors.map(({ rowIndex }) => rowIndex);
    }
  }

  const assignmentByExpected = new Map(rowAssignments
    .filter(({ expectedIndex }) => Number.isInteger(expectedIndex))
    .map((assignment) => [assignment.expectedIndex, assignment]));
  const expectedAssignments = expected.map((expectedNumber, expectedIndex) => {
    const assignment = assignmentByExpected.get(expectedIndex);
    if (assignment) return { ...assignment };
    return {
      rowIndex: null,
      expectedIndex,
      expectedNumber,
      observedCandidate: "",
      accepted: false,
      reviewRequired: true,
      confidence: 0,
      alignmentConfidence: 0,
      pathMargin: 0,
      evidenceType: "missing-observed-row",
      reasonCodes: ["missing-observed-row"],
    };
  });
  const matched = rowAssignments.filter(({ expectedIndex }) => Number.isInteger(expectedIndex));
  const acceptedCount = matched.filter(({ accepted }) => accepted).length;
  const extraRowCount = rowAssignments.length - matched.length;
  const missingExpectedCount = expectedAssignments.filter(({ rowIndex }) => rowIndex === null).length;
  return {
    alignmentVersion: 1,
    rowAssignments,
    expectedAssignments,
    missingExpected: expectedAssignments.filter(({ rowIndex }) => rowIndex === null),
    unmatchedRows: rowAssignments.filter(({ expectedIndex }) => expectedIndex === null),
    summary: {
      observedCount: rows.length,
      expectedCount: expected.length,
      assignedCount: matched.length,
      acceptedCount,
      matchedReviewCount: matched.length - acceptedCount,
      extraRowCount,
      missingExpectedCount,
      exactOcrCount: matched.filter(({ evidenceType }) => evidenceType === "exact-primary").length,
      sequenceResolvedCount: matched.filter(({ reasonCodes }) => (
        reasonCodes.includes("sequence-aligned")
      )).length,
      pathScore: forward.bestScore,
      autoAcceptable: acceptedCount === expected.length
        && extraRowCount === 0
        && missingExpectedCount === 0,
    },
  };
}

// 未確定のDP候補を台番号入力値へ混ぜない。確定済みの期待番号、または
// 期待集合と独立に合格した生OCR番号だけを主値にし、候補は別フィールドへ残す。
export function resolveAlignedMachineNumber(rawRow, assignment) {
  const observed = normalizeMachineNumber(
    rawRow?.machineNumberCandidate ?? rawRow?.num,
  );
  const suggestedNumber = normalizeMachineNumber(assignment?.expectedNumber);
  if (assignment?.accepted === true && suggestedNumber) {
    return { num: suggestedNumber, suggestedNumber, source: "aligned-expected" };
  }
  const duplicatedConflict = assignment?.duplicateObservedCandidate === true
    && observed !== suggestedNumber;
  if (rawRow?.machineNumberAccepted === true && observed && !duplicatedConflict) {
    return { num: observed, suggestedNumber, source: "trusted-raw-ocr" };
  }
  return { num: "", suggestedNumber, source: "review-suggestion" };
}
