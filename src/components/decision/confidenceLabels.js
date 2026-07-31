// src/components/decision/confidenceLabels.js
// 後方互換用。表示語と閾値の唯一の定義は decisionVocabulary.js に集約する。

import {
  CONFIDENCE_THRESHOLDS,
  confidenceLevelLabel,
} from "./decisionVocabulary.js";

export const CONF_HIGH = CONFIDENCE_THRESHOLDS.high;
export const CONF_MID = CONFIDENCE_THRESHOLDS.medium;

/**
 * 信頼度（0〜1の小数）を3段階の信頼度ランクへ変換する。
 *
 * @param {number} confidence - evDecision の confidence（0〜1）
 * @returns {"高い" | "中" | "低い"}
 */
export function confidenceAccuracyLabel(confidence) {
  return confidenceLevelLabel(confidence);
}
