// src/components/decision/confidenceLabels.js
// 信頼度（confidence: 0〜1）を「データ精度」3段階ラベルに変換する共通定義。
// 純粋関数。React/DOM 依存ゼロ。
// evDecision.js の reasons が「信頼度 基準40%以上」を判定基準にしているため、
// CONF_MID = 0.4 を中間境界として採用する。

export const CONF_HIGH = 0.7;
export const CONF_MID = 0.4;

/**
 * 信頼度（0〜1の小数）を3段階のデータ精度ラベルに変換する。
 *
 * @param {number} confidence - evDecision の confidence（0〜1）
 * @returns {"高い" | "中" | "低い"}
 */
export function confidenceAccuracyLabel(confidence) {
  const c = confidence || 0;
  if (c >= CONF_HIGH) return "高い";
  if (c >= CONF_MID) return "中";
  return "低い";
}
