// 貸玉レートと回転記録の単位を同じ基準で扱うための純粋関数。
// rentBalls は「1,000円で借りられる玉数」を表す（例: 4円=250玉、1円=1,000玉）。

export const PACHINKO_RATE_PRESETS = Object.freeze([
  { label: "4円", rentBalls: 250, recommendedInvestPace: 1000 },
  { label: "2円", rentBalls: 500, recommendedInvestPace: 400 },
  { label: "1円", rentBalls: 1000, recommendedInvestPace: 200 },
  { label: "0.5円", rentBalls: 2000, recommendedInvestPace: 100 },
]);

const positiveNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function rentalYenPerBall(rentBalls) {
  const balls = positiveNumber(rentBalls);
  return balls > 0 ? 1000 / balls : 0;
}
export function ballsForInvestment(investYen, rentBalls) {
  const yen = positiveNumber(investYen);
  const balls = positiveNumber(rentBalls);
  return yen > 0 && balls > 0 ? (yen / 1000) * balls : 0;
}

export function formatBallQuantity(value) {
  const balls = Number(value);
  if (!Number.isFinite(balls)) return "0";
  return Number.isInteger(balls)
    ? balls.toLocaleString("ja-JP")
    : balls.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
}

export function formatPachinkoRateLabel(rentBalls) {
  const balls = positiveNumber(rentBalls);
  if (!(balls > 0)) return "—";
  const preset = PACHINKO_RATE_PRESETS.find((item) => item.rentBalls === balls);
  if (preset) return preset.label;
  const yenPerBall = 1000 / balls;
  const digits = yenPerBall >= 1 ? 2 : 3;
  return `${Number(yenPerBall.toFixed(digits))}円`;
}

// 遊タイム計算など、店舗選択後に開く画面で使う貸玉・交換率の解決処理。
// 選択店舗に登録値があれば店舗を優先し、不足時だけアプリ共通設定へ戻す。
export function resolvePachinkoRateContext({
  stores = [],
  selectedStoreId = null,
  rentBalls = 250,
  exRate = 250,
} = {}) {
  const list = Array.isArray(stores) ? stores : [];
  const store = list.find((item) => (
    item
    && typeof item === "object"
    && selectedStoreId != null
    && String(item.id) === String(selectedStoreId)
  )) || null;
  const fallbackRentBalls = positiveNumber(rentBalls, 250);
  const storeRentBalls = positiveNumber(store?.rentBalls);
  const resolvedRentBalls = storeRentBalls || fallbackRentBalls;
  const resolvedExRate = storeRentBalls
    ? positiveNumber(store?.exRate, resolvedRentBalls)
    : positiveNumber(exRate, resolvedRentBalls);

  return {
    rentBalls: resolvedRentBalls,
    exRate: resolvedExRate,
    rateLabel: formatPachinkoRateLabel(resolvedRentBalls),
    source: storeRentBalls ? "store" : "app",
    storeId: store?.id ?? null,
    storeName: String(store?.name || "").trim(),
  };
}
