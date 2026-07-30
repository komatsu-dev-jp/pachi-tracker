// 共同照合で安全に対応した表行へ、確定した台番号と監査情報を反映する純粋関数。
// 台番号だけが要確認だった行は解除し、回転数など別項目の要確認はそのまま残す。

const TABLE_MAX_PAYOUT_MAX_SCORE = 0.02;
const TABLE_MAX_PAYOUT_MIN_CANDIDATE_GAP = 0.03;
const GRAPH_MAX_PAYOUT_MAX_SCORE = 0.16;
const GRAPH_MAX_PAYOUT_MIN_CANDIDATE_GAP = 0.025;
const MAX_PAYOUT_LIMIT = 100_000_000;
const REQUIRED_TABLE_FIELDS_EXCEPT_MAX_PAYOUT = Object.freeze([
  "cumulativeStarts",
  "normalSpins",
  "firstHitCount",
  "totalStarts",
]);
const ALLOWED_GRAPH_MAX_PAYOUT_REASONS = new Set([
  "max-payout-low-confidence",
  "max-payout-threshold-disagreement",
]);

function normalizedNonNegativeInteger(value) {
  const text = String(value ?? "").trim().replace(/[，,]/gu, "");
  if (!/^\d+$/u.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizedMachineNumber(value) {
  const parsed = normalizedNonNegativeInteger(value);
  return parsed !== null && parsed > 0 ? String(parsed) : "";
}

function candidateEvidence(candidates, expectedValue, {
  maximumBestMetric,
  minimumGap,
  metric,
}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const best = list[0];
  const second = list[1];
  const bestValue = normalizedNonNegativeInteger(best?.value);
  const bestMetric = Number(best?.[metric]);
  const secondMetric = Number(second?.[metric]);
  if (bestValue !== expectedValue
    || !Number.isFinite(bestMetric)
    || !Number.isFinite(secondMetric)) {
    return null;
  }
  const gap = secondMetric - bestMetric;
  if (bestMetric > maximumBestMetric || gap < minimumGap) return null;
  return { bestMetric, secondMetric, gap };
}

function independentMaxPayoutEvidence(row, match) {
  if (match?.accepted !== true
    || match?.matchType !== "num-exact"
    || match?.matchedBy !== "num"
    || row?.numAccepted !== true
    || row?.fieldAccepted?.maxPayout !== false
    || row?.globalReviewRequired === true
    || row?.jointEvidenceRejected === true
    || (row?.editedFields || []).includes("maxPayout")
    || !REQUIRED_TABLE_FIELDS_EXCEPT_MAX_PAYOUT.every(
      (field) => row?.fieldAccepted?.[field] === true,
    )) {
    return null;
  }

  const resolvedNum = normalizedMachineNumber(match.resolvedNum);
  const tableNum = normalizedMachineNumber(row.num);
  const graphPanel = match.graphPanel;
  const graphNum = normalizedMachineNumber(
    graphPanel?.machineNumberOcr?.candidate
      ?? graphPanel?.observedNumCandidate
      ?? graphPanel?.machineNumber,
  );
  if (!resolvedNum
    || tableNum !== resolvedNum
    || graphNum !== resolvedNum
    || graphPanel?.machineNumberAccepted !== true
    || graphPanel?.machineNumberOcr?.accepted !== true
    || graphPanel?.status !== "ok") {
    return null;
  }

  const tableSource = String(row?.sourceFile || "").trim();
  const graphSource = String(graphPanel?.source?.imageName || "").trim();
  if (!tableSource || !graphSource
    || tableSource.localeCompare(graphSource, undefined, { sensitivity: "accent" }) === 0) {
    return null;
  }

  const tableValue = normalizedNonNegativeInteger(row.maxPayout);
  const graphValue = normalizedNonNegativeInteger(
    graphPanel?.graphMaxPayout?.value ?? graphPanel?.maxPayout,
  );
  if (tableValue === null
    || tableValue > MAX_PAYOUT_LIMIT
    || graphValue !== tableValue) {
    return null;
  }

  const graphReasons = Array.isArray(graphPanel?.graphMaxPayout?.reasons)
    ? graphPanel.graphMaxPayout.reasons
    : [];
  if (graphReasons.some((reason) => !ALLOWED_GRAPH_MAX_PAYOUT_REASONS.has(reason))) {
    return null;
  }

  const tableCandidate = candidateEvidence(row.maxPayoutCandidates, tableValue, {
    maximumBestMetric: TABLE_MAX_PAYOUT_MAX_SCORE,
    minimumGap: TABLE_MAX_PAYOUT_MIN_CANDIDATE_GAP,
    metric: "score",
  });
  const graphCandidate = candidateEvidence(
    graphPanel?.graphMaxPayout?.candidates,
    graphValue,
    {
      maximumBestMetric: GRAPH_MAX_PAYOUT_MAX_SCORE,
      minimumGap: GRAPH_MAX_PAYOUT_MIN_CANDIDATE_GAP,
      metric: "score",
    },
  );
  if (!tableCandidate || !graphCandidate) return null;

  const maxPayoutReviewReason = String(row?.fieldReviewReason?.maxPayout || "");
  if (!maxPayoutReviewReason
    || String(row?.nonNumberReviewReason || "") !== maxPayoutReviewReason) {
    return null;
  }

  return {
    source: "table-graph-cross-image-consensus",
    value: tableValue,
    machineNumber: resolvedNum,
    table: {
      sourceFile: tableSource,
      bestScore: tableCandidate.bestMetric,
      candidateGap: tableCandidate.gap,
    },
    graph: {
      sourceFile: graphSource,
      panelId: String(match.panelId || graphPanel?.panelId || ""),
      bestScore: graphCandidate.bestMetric,
      candidateGap: graphCandidate.gap,
    },
  };
}

export function resolveMatchedSiteSevenRows(tableRows, matches) {
  const rows = Array.isArray(tableRows) ? tableRows : [];
  const matchByTableIndex = new Map(
    (Array.isArray(matches) ? matches : [])
      .filter((match) => match?.accepted === true && Number.isInteger(match.tableIndex))
      .map((match) => [match.tableIndex, match]),
  );

  return rows.map((row, tableIndex) => {
    const match = matchByTableIndex.get(tableIndex);
    if (!match) return row;
    const maxPayoutResolution = independentMaxPayoutEvidence(row, match);
    const nonNumberReviewRequired = maxPayoutResolution
      ? false
      : row?.nonNumberReviewRequired === true;
    return {
      ...row,
      num: String(match.resolvedNum),
      numAccepted: true,
      fieldAccepted: row?.fieldAccepted
        ? {
          ...row.fieldAccepted,
          num: true,
          ...(maxPayoutResolution ? { maxPayout: true } : {}),
        }
        : row?.fieldAccepted,
      fieldReviewRequired: row?.fieldReviewRequired
        ? {
          ...row.fieldReviewRequired,
          num: false,
          ...(maxPayoutResolution ? { maxPayout: false } : {}),
        }
        : row?.fieldReviewRequired,
      fieldReviewReason: row?.fieldReviewReason
        ? {
          ...row.fieldReviewReason,
          num: "",
          ...(maxPayoutResolution ? { maxPayout: "" } : {}),
        }
        : row?.fieldReviewReason,
      ...(maxPayoutResolution ? {
        maxPayoutAccepted: true,
        nonNumberReviewRequired: false,
        nonNumberReviewReason: "",
        maxPayoutResolution,
      } : {}),
      reviewRequired: nonNumberReviewRequired,
      reviewConfirmed: false,
      reviewReason: nonNumberReviewRequired
        ? row?.nonNumberReviewReason || row?.reviewReason || ""
        : "",
      matchedBy: match.matchedBy,
      jointMatchAccepted: true,
      jointPanelId: match.panelId,
    };
  });
}
