export const STORE_RATE_STATUS = Object.freeze({
  VERIFIED: "verified",
  PARTIAL: "partially_verified",
  UNCONFIRMED: "unconfirmed",
});

export const RATE_UNCONFIRMED_REASON = Object.freeze({
  UNKNOWN: "unknown",
  STALE: "stale",
  NO_PACHINKO: "no_pachinko",
});

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export function normalizePachinkoRates(rates) {
  if (!Array.isArray(rates)) return [];
  return rates.map((rate) => {
    const lendingYen = toFiniteNumber(rate?.lendingYen);
    if (lendingYen == null) return null;
    const exchangeBallsPer100Yen = toFiniteNumber(rate?.exchangeBallsPer100Yen);
    return {
      lendingYen,
      exchangeBallsPer100Yen,
      exchangeStatus: exchangeBallsPer100Yen != null
        ? STORE_RATE_STATUS.VERIFIED
        : STORE_RATE_STATUS.UNCONFIRMED,
      unconfirmedReason: exchangeBallsPer100Yen == null
        ? (rate?.unconfirmedReason || RATE_UNCONFIRMED_REASON.UNKNOWN)
        : null,
      note: String(rate?.note || ""),
    };
  }).filter(Boolean);
}

export function deriveStoreRateStatus(rates, fallback = STORE_RATE_STATUS.UNCONFIRMED) {
  const normalized = normalizePachinkoRates(rates);
  if (!normalized.length) return fallback;
  const verified = normalized.filter((rate) => rate.exchangeStatus === STORE_RATE_STATUS.VERIFIED).length;
  if (verified === normalized.length) return STORE_RATE_STATUS.VERIFIED;
  if (verified > 0) return STORE_RATE_STATUS.PARTIAL;
  return STORE_RATE_STATUS.UNCONFIRMED;
}

export function storeRateStatusLabel(status) {
  if (status === STORE_RATE_STATUS.VERIFIED) return "交換率確認済み";
  if (status === STORE_RATE_STATUS.PARTIAL) return "一部のみ確認済み";
  return "交換率未確認";
}

export function formatExchangeRate(rate) {
  const exchangeBalls = toFiniteNumber(rate?.exchangeBallsPer100Yen);
  if (exchangeBalls == null) {
    if (rate?.unconfirmedReason === RATE_UNCONFIRMED_REASON.STALE) return "古い情報のため未確認";
    return "非等価・具体値未確認";
  }
  const lendingYen = toFiniteNumber(rate?.lendingYen);
  const equivalentBalls = lendingYen == null ? null : 100 / lendingYen;
  const equivalent = equivalentBalls != null && Math.abs(equivalentBalls - exchangeBalls) < 0.05;
  return equivalent ? `等価（${exchangeBalls}玉/100円）` : `${exchangeBalls}玉/100円`;
}

export function formatPachinkoRateResearchSummary(rates) {
  const normalized = normalizePachinkoRates(rates);
  if (!normalized.length) return "パチンコ貸玉の掲載なし";
  return normalized.map((rate) => {
    const lending = Number.isInteger(rate.lendingYen) ? rate.lendingYen : String(rate.lendingYen);
    return `${lending}円: ${formatExchangeRate(rate)}`;
  }).join(" / ");
}

export function formatResearchDate(dateText) {
  const matched = String(dateText || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return matched ? `${matched[1]}/${matched[2]}/${matched[3]}` : "確認日未記録";
}
