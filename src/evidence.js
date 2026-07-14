// P-EVIDENCE のスプレッドシート計算を、通信なしでアプリ内実行する純粋関数。
// 信頼度 = 累積投資玉 / (累積投資玉 + ムラ係数)
// 予測回転率 = 実測回転率 * 信頼度 + 真のボーダー * (1 - 信頼度)
// 良台スコア = MAX(0, (予測回転率 - 真のボーダー) * 信頼度 * 100)

const DEFAULT_PRIOR_BALLS = 50000;
const BALLS_PER_1K = 250;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function runEvidence(ev = {}, settings = {}) {
  const trueBorder = finite(settings.trueBorder ?? ev.theoreticalBorder ?? ev.useBorder, 0);
  const observedRotation = finite(
    ev.effectiveStart1K ?? ev.start1KCorrected ?? ev.start1K,
    0,
  );
  const totalKCount = Math.max(
    0,
    finite(ev.cashKCount) + finite(ev.mochiKCount) + finite(ev.chodamaKCount),
  );
  // 1Kあたりの玉数は店の貸玉レート依存（4円等価=250）。低貸し等では250固定にしない。
  const ballsPerK = Math.max(1, finite(settings.ballsPerK, BALLS_PER_1K));
  const accumulatedBalls = totalKCount * ballsPerK;
  const priorBalls = Math.max(0, finite(settings.priorBalls, DEFAULT_PRIOR_BALLS));
  const liveConfidence = accumulatedBalls > 0
    ? clamp(accumulatedBalls / (accumulatedBalls + priorBalls), 0, 1)
    : 0;
  const deltaConfidence = clamp(finite(settings.priorConfidence), 0, 1);
  const priorRotation = finite(settings.priorRotation, trueBorder) > 0
    ? finite(settings.priorRotation, trueBorder)
    : trueBorder;
  const confidence = 1 - (1 - deltaConfidence) * (1 - liveConfidence);

  const hasLiveEstimate = trueBorder > 0 && observedRotation > 0;
  const hasDeltaEstimate = trueBorder > 0 && deltaConfidence > 0 && priorRotation > 0;
  const hasEstimate = hasLiveEstimate || hasDeltaEstimate;
  const predictedRotation = hasLiveEstimate
    ? observedRotation * liveConfidence + priorRotation * (1 - liveConfidence)
    : (hasDeltaEstimate ? priorRotation : trueBorder);
  const borderDifference = hasEstimate ? predictedRotation - trueBorder : 0;
  const goodMachineScore = Math.max(0, borderDifference * confidence * 100);

  const samples1K = Math.max(1, totalKCount);
  const standardError = 2 / Math.sqrt(samples1K);
  const predictedLow = Math.max(0, predictedRotation - 1.96 * standardError);
  const predictedHigh = predictedRotation + 1.96 * standardError;

  // 信頼度20%未満はグレードを断言しない（deltaEvidence と同じゲート）。
  let grade = "データ収集中";
  if (hasEstimate && confidence >= 0.2) {
    if (goodMachineScore >= 50) grade = "鉄板";
    else if (goodMachineScore >= 30) grade = "狙い";
    else if (goodMachineScore >= 10) grade = "候補";
    else grade = "回収注意";
  }

  return {
    trueBorder,
    observedRotation,
    predictedRotation,
    posteriorMean: predictedRotation,
    confidence,
    trialSufficiency: confidence,
    goodMachineScore,
    scoreForRanking: goodMachineScore,
    borderDifference,
    accumulatedBalls,
    priorBalls,
    liveConfidence,
    deltaConfidence,
    priorRotation,
    predictedLow,
    predictedHigh,
    grade,
    hasEstimate,
    source: hasLiveEstimate && hasDeltaEstimate
      ? "delta+live"
      : (hasDeltaEstimate ? "delta" : (hasLiveEstimate ? "live" : "none")),
  };
}

export { BALLS_PER_1K, DEFAULT_PRIOR_BALLS };
