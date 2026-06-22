export function getPredictedSpinRate(ev = {}) {
  const rawRate = Number(ev.start1K);
  if (Number.isFinite(rawRate) && rawRate > 0) return rawRate;

  const correctedRate = Number(ev.effectiveStart1K ?? ev.start1KCorrected);
  return Number.isFinite(correctedRate) && correctedRate > 0 ? correctedRate : 0;
}
