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
