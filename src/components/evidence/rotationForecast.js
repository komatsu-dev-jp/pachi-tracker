// 翌日回転率の「表示用95%範囲」と「着席判断用の下限」を分離する。
//
// 95%両側範囲の下端は下位2.5%点であり、日常の台選びには極端すぎる。
// 判断用下限は下位20%点（実測が下限以上になる目標80%）を標準とし、
// 十分な過去実績がある場合だけバックテストで係数を校正する。

export const NORMAL_95_Z = 1.959963984540054;
export const DECISION_LOWER_QUANTILE = 0.2;
export const DECISION_LOWER_TARGET_COVERAGE = 1 - DECISION_LOWER_QUANTILE;
export const DECISION_LOWER_DEFAULT_Z = 0.8416212335729143;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Abramowitz and Stegun 7.1.26. UI用確率として十分な精度を持つ近似。
export function normalCdf(value) {
  const x = finite(value);
  if (x === null) return null;
  if (x < -10) return 0;
  if (x > 10) return 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const scaled = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * scaled);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1)
    * t * Math.exp(-(scaled ** 2));
  return 0.5 * (1 + sign * y);
}

export function standardDeviationFromVariance(variance) {
  const value = finite(variance);
  return value !== null && value >= 0 ? Math.sqrt(value) : null;
}

export function predictionInterval95(mean, variance) {
  const center = finite(mean);
  const sd = standardDeviationFromVariance(variance);
  if (center === null || sd === null) return { low: null, high: null };
  return {
    low: Math.max(0, center - NORMAL_95_Z * sd),
    high: center + NORMAL_95_Z * sd,
  };
}

export function decisionLowerBound(mean, variance, k = DECISION_LOWER_DEFAULT_Z) {
  const center = finite(mean);
  const sd = standardDeviationFromVariance(variance);
  const multiplier = finite(k);
  if (center === null || sd === null || multiplier === null || multiplier < 0) return null;
  return Math.max(0, center - multiplier * sd);
}

export function probabilityAboveThreshold(mean, variance, threshold) {
  const center = finite(mean);
  const target = finite(threshold);
  const sd = standardDeviationFromVariance(variance);
  if (center === null || target === null || sd === null) return null;
  if (sd === 0) {
    if (center > target) return 1;
    if (center < target) return 0;
    return 0.5;
  }
  return normalCdf((center - target) / sd);
}

// quantile は予測した分位点の水準。下位20%点なら0.2。
export function quantilePinballLoss(actual, predictedQuantile, quantile = DECISION_LOWER_QUANTILE) {
  const observed = finite(actual);
  const forecast = finite(predictedQuantile);
  const level = finite(quantile);
  if (observed === null || forecast === null || level === null || level <= 0 || level >= 1) return null;
  const error = observed - forecast;
  return error >= 0 ? level * error : (1 - level) * -error;
}
