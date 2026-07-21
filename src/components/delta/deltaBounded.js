// グラフの終点が表示上限/下限で切れた行を、偽の一点値へ変換せず
// 「ここから先/ここまで」という範囲データとして保持する純粋関数。

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasReason(row, code) {
  return Array.isArray(row?.reasonCodes) && row.reasonCodes.includes(code);
}

export function deriveClippedDeltaRange(row) {
  const observation = row?.boundaryObservation ?? row?.rawGraphCandidate?.boundaryObservation;
  const boundaryValue = finite(observation?.value);
  const graphConfidence = finite(row?.rawGraphCandidate?.confidence) ?? finite(row?.confidence);
  // An image-wide fallback calibration is useful as a candidate, but it is not
  // strong enough to become a check-free, persistent bound for one panel.
  if (boundaryValue === null
    || row?.calibration?.source !== "panel"
    || finite(row?.calibration?.quality) < 0.7
    || graphConfidence < 0.7) return null;

  if (observation?.kind === "censored-top" && hasReason(row, "endpoint-clipped-top")) {
    return {
      kind: "censored-top",
      boundary: "top",
      boundaryValue,
      observedCandidate: finite(row?.rawGraphCandidate?.val) ?? finite(row?.val),
      lower: null,
      upper: null,
      source: "graph-boundary",
      metricSemantics: null,
      exact: false,
    };
  }

  if (observation?.kind === "censored-bottom" && hasReason(row, "endpoint-clipped-bottom")) {
    return {
      kind: "censored-bottom",
      boundary: "bottom",
      boundaryValue,
      observedCandidate: finite(row?.rawGraphCandidate?.val) ?? finite(row?.val),
      lower: null,
      upper: null,
      source: "graph-boundary",
      metricSemantics: null,
      exact: false,
    };
  }
  return null;
}

export function isBoundedDeltaRow(row) {
  if (!row || row?.reviewConfirmed === true
    || row?.status !== "bounded" || row?.valueSource !== "bounded-range") return false;
  // 境界到達記録に一点値やランクが混ざると、後続集計が正確値として
  // 扱う余地が生まれる。保存形では必ず両方を空にする。
  if (finite(row?.val) !== null || row?.rank !== null) return false;
  const range = row?.deltaRange;
  const derived = deriveClippedDeltaRange(row);
  if (!range || !derived || range.exact === true) return false;
  const lower = finite(range.lower);
  const upper = finite(range.upper);
  const censored = ["censored-top", "censored-bottom"].includes(range.kind)
    && finite(range.boundaryValue) !== null;
  const validOrder = lower === null || upper === null || lower <= upper;
  return censored
    && validOrder
    && range.kind === derived.kind
    && range.boundary === derived.boundary
    && finite(range.boundaryValue) === finite(derived.boundaryValue)
    && finite(range.observedCandidate) === finite(derived.observedCandidate)
    && lower === finite(derived.lower)
    && upper === finite(derived.upper)
    && range.source === derived.source;
}

export function attachClippedDeltaRanges(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    if (!row || row?.reviewConfirmed === true) return row;
    const range = deriveClippedDeltaRange(row);
    if (!range) return row;
    const previousRaw = row?.rawGraphCandidate && typeof row.rawGraphCandidate === "object"
      ? row.rawGraphCandidate
      : {
        val: finite(row?.val),
        rank: row?.rank ?? null,
        status: row?.status || "review",
        confidence: finite(row?.confidence),
        valueSource: row?.valueSource || "graph",
        boundaryObservation: row?.boundaryObservation
          ? { ...row.boundaryObservation }
          : null,
      };
    return {
      ...row,
      val: null,
      rank: null,
      status: "bounded",
      confidence: 0,
      valueSource: "bounded-range",
      reviewConfirmed: false,
      reviewedAt: null,
      rawGraphCandidate: previousRaw,
      deltaRange: range,
    };
  });
}

export function formatDeltaRange(range, formatter = (value) => String(value)) {
  const boundaryValue = finite(range?.boundaryValue);
  if (range?.kind === "censored-top" && boundaryValue !== null) {
    return `上限付近（${formatter(boundaryValue)}玉超の可能性）`;
  }
  if (range?.kind === "censored-bottom" && boundaryValue !== null) {
    return `下限付近（${formatter(boundaryValue)}玉未満の可能性）`;
  }
  const lower = finite(range?.lower);
  const upper = finite(range?.upper);
  if (lower !== null && upper !== null) return `${formatter(lower)}〜${formatter(upper)}玉`;
  if (lower !== null) return `${formatter(lower)}玉以上`;
  if (upper !== null) return `${formatter(upper)}玉以下`;
  return "範囲不明";
}
