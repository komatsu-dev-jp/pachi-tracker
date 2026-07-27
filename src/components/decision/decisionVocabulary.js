// 画面ごとに独自の判定語を作らないための唯一の定義。
// 内部IDは後方互換のため維持し、表示語・意味・判定閾値をここへ集約する。

export const DECISION_TERMS = Object.freeze({
  confidence: "信頼度",
  confidenceLevel: "信頼度ランク",
  coverage: "記録カバー率",
  status: "判定",
});

export const CONFIDENCE_THRESHOLDS = Object.freeze({
  minimum: 0.2,
  medium: 0.4,
  high: 0.7,
});

export const EVIDENCE_SCORE_THRESHOLDS = Object.freeze({
  watch: 10,
  strong: 50,
});

export const EV_DECISION_THRESHOLDS = Object.freeze({
  strongEvPerK: 300,
  strongConfidence: 0.5,
  strongBorderDiff: 2,
  continueEvPerK: 100,
  continueConfidence: 0.4,
  continueBorderDiff: 0.5,
  holdEvMin: -50,
  holdEvMax: 100,
  holdConfidence: 0.3,
  stopEvPerK: -50,
  stopBorderDiff: -1,
});

export const LIVE_DECISION_THRESHOLDS = Object.freeze({
  immediateStop: 0.1,
  stopOrReview: 0.4,
  continue: 0.7,
  strongContinue: 0.9,
});

export const LIVE_CHECKPOINTS_K = Object.freeze([3, 5, 10, 20]);

export const DECISION_TIER_META = Object.freeze({
  strong: Object.freeze({
    label: "有力",
    sessionAction: "続行（有力）",
    candidateAction: "優先候補",
  }),
  positive: Object.freeze({
    label: "候補",
    sessionAction: "続行（候補）",
    candidateAction: "候補",
  }),
  watch: Object.freeze({
    label: "様子見",
    sessionAction: "様子見",
    candidateAction: "実測して判断",
  }),
  stop: Object.freeze({
    label: "見送り",
    sessionAction: "撤退",
    candidateAction: "見送り",
  }),
  nodata: Object.freeze({
    label: "判定待ち",
    sessionAction: "データ待ち",
    candidateAction: "判定待ち",
  }),
});

const TIER_ALIASES = Object.freeze({
  strong: "strong",
  continue_strong: "strong",
  positive: "positive",
  good: "positive",
  continue: "positive",
  watch: "watch",
  hold: "watch",
  collecting: "watch",
  compare: "watch",
  weak: "stop",
  stop: "stop",
  stop_candidate: "stop",
  nodata: "nodata",
  no_data: "nodata",
});

export const LIVE_ACTION_LABELS = Object.freeze({
  no_data: DECISION_TIER_META.nodata.sessionAction,
  collecting: "次の判定まで計測",
  stop_candidate: "撤退候補",
  compare: "他台と比較",
  stop: DECISION_TIER_META.stop.sessionAction,
  continue: DECISION_TIER_META.positive.sessionAction,
  continue_strong: DECISION_TIER_META.strong.sessionAction,
});

export const EV_VERDICT_FROM_LIVE_ACTION = Object.freeze({
  collecting: "hold",
  stop_candidate: "stop",
  compare: "hold",
  stop: "stop",
  continue: "continue",
  continue_strong: "continue_strong",
});

export function decisionTier(value) {
  return TIER_ALIASES[String(value || "")] || "nodata";
}

export function decisionMeta(value) {
  return DECISION_TIER_META[decisionTier(value)];
}

export function decisionLabel(value) {
  return decisionMeta(value).label;
}

export function sessionActionLabel(value) {
  return LIVE_ACTION_LABELS[value] || decisionMeta(value).sessionAction;
}

export function confidenceLevelLabel(confidence) {
  const value = Number(confidence) || 0;
  if (value >= CONFIDENCE_THRESHOLDS.high) return "高い";
  if (value >= CONFIDENCE_THRESHOLDS.medium) return "中";
  return "低い";
}

export function classifyEvidenceTier(score, confidence) {
  const normalized = Number(confidence) || 0;
  const ratio = normalized > 1 ? normalized / 100 : normalized;
  if (ratio < CONFIDENCE_THRESHOLDS.minimum) return "nodata";
  if ((Number(score) || 0) >= EVIDENCE_SCORE_THRESHOLDS.strong) return "strong";
  if ((Number(score) || 0) >= EVIDENCE_SCORE_THRESHOLDS.watch) return "watch";
  return "weak";
}

export function evidenceActionLabel(verdict, { tight = false } = {}) {
  if (tight) return DECISION_TIER_META.stop.candidateAction;
  return decisionMeta(verdict).candidateAction;
}
