// 実戦中の回転率を3K・5K・10K・20Kの固定地点で評価する純粋関数。
// Kは「1,000円相当の貸玉を使った量」。大当たり回転や出玉収支は混ぜない。
export const LIVE_CHECKPOINTS_K = [3, 5, 10, 20];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// ベータ分布の累積確率を数値計算する。
function betaContinuedFraction(a, b, x) {
  const maxIterations = 200;
  const epsilon = 3e-10;
  const fpMin = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpMin) d = fpMin;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIterations; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return h;
}

function logGamma(z) {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  let x = 0.99999999999980993;
  const shifted = z - 1;
  for (let i = 0; i < coefficients.length; i += 1) x += coefficients[i] / (shifted + i + 1);
  const t = shifted + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(x);
}

function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

function betaSummary(alpha, beta, targetProbability) {
  const sum = alpha + beta;
  const mean = alpha / sum;
  const variance = (alpha * beta) / (sum * sum * (sum + 1));
  const sd = Math.sqrt(Math.max(0, variance));
  return {
    mean,
    low90: clamp(mean - 1.645 * sd, 0, 1),
    high90: clamp(mean + 1.645 * sd, 0, 1),
    aboveTarget: clamp(1 - regularizedBeta(targetProbability, alpha, beta), 0, 1),
  };
}

function actionFor(totalK, probability, prePlayStrong) {
  if (totalK < 3) return "collecting";
  if (probability < 0.1) return totalK < 5 ? "stop_candidate" : "stop";
  if (probability < 0.4) return totalK >= 10 ? "stop" : "stop_candidate";
  if (probability < 0.7) {
    if (totalK >= 10) return "compare";
    if (totalK >= 5) return prePlayStrong ? "continue" : "compare";
    return "collecting";
  }
  if (probability < 0.9) return "continue";
  return "continue_strong";
}

const ACTION_LABELS = {
  no_data: "データ待ち",
  collecting: "次の判定まで計測",
  stop_candidate: "撤退候補",
  compare: "他台と比較",
  stop: "撤退",
  continue: "続行",
  continue_strong: "強く続行",
};

export function assessLiveRotation(input = {}) {
  const trueBorder = Math.max(0, finite(input.trueBorder));
  const normalSpins = Math.max(0, finite(input.normalSpins));
  const totalK = Math.max(0, finite(input.totalK));
  const rentBalls = Math.max(1, finite(input.rentBalls, 250));
  const observedRotation = totalK > 0 ? normalSpins / totalK : 0;
  const priorConfidence = clamp(finite(input.priorConfidence), 0, 1);
  const priorScore = Math.max(0, finite(input.priorScore));
  const contextStrong = input.contextStrong === true;
  const prePlayStrong = contextStrong || (priorScore >= 70 && priorConfidence >= 0.6);
  const targetMargin = prePlayStrong ? 1.5 : 2;
  const targetRotation = trueBorder > 0 ? trueBorder + targetMargin : 0;
  const nextCheckpointK = LIVE_CHECKPOINTS_K.find((checkpoint) => totalK < checkpoint) ?? null;
  const reachedCheckpointK = [...LIVE_CHECKPOINTS_K].reverse().find((checkpoint) => totalK >= checkpoint) ?? 0;
  const remainingK = nextCheckpointK == null ? 0 : Math.max(0, nextCheckpointK - totalK);
  const remainingBalls = Math.ceil(remainingK * rentBalls);

  if (!(trueBorder > 0) || !(totalK > 0) || !(normalSpins > 0) || targetRotation >= rentBalls) {
    return {
      action: totalK > 0 ? "collecting" : "no_data",
      actionLabel: ACTION_LABELS[totalK > 0 ? "collecting" : "no_data"],
      trueBorder, targetMargin, targetRotation, normalSpins, totalK, rentBalls, observedRotation,
      nextCheckpointK, reachedCheckpointK, remainingK, remainingBalls,
      liveProbability: 0, bayesianProbability: 0, decisionProbability: 0,
      low90: 0, high90: 0, prePlayStrong, priorEquivalentK: 0,
      standardDeviationPerK: 0, standardDeviationSource: "none",
      reason: trueBorder > 0 ? "通常回転と使用した玉数を記録してください。" : "真のボーダーを設定してください。",
    };
  }

  const targetProbability = clamp(targetRotation / rentBalls, 1e-9, 1 - 1e-9);
  const theoreticalSd = Math.sqrt(targetRotation * (1 - targetRotation / rentBalls));
  const enteredSd = finite(input.rotationStdDevPerK);
  const standardDeviationPerK = enteredSd > 0 ? enteredSd : theoreticalSd * 1.15;
  const standardDeviationSource = enteredSd > 0 ? "machine" : "safe_fallback";
  const designEffect = Math.max(1, (standardDeviationPerK / Math.max(theoreticalSd, 1e-9)) ** 2);
  const consumedBalls = totalK * rentBalls;
  const effectiveBalls = consumedBalls / designEffect;
  const effectiveSpins = clamp(normalSpins / designEffect, 0, effectiveBalls);
  const live = betaSummary(effectiveSpins + 0.5, effectiveBalls - effectiveSpins + 0.5, targetProbability);

  const priorRotation = clamp(finite(input.priorRotation, trueBorder), 0, rentBalls);
  // 過去データは最大3K相当に制限し、今日の実測を上書きしない。
  const priorEquivalentK = priorRotation > 0 ? Math.min(3, priorConfidence * 3) : 0;
  const priorBalls = priorEquivalentK * rentBalls;
  const priorSpins = (priorRotation / rentBalls) * priorBalls;
  const posterior = betaSummary(
    effectiveSpins + priorSpins + 0.5,
    effectiveBalls - effectiveSpins + priorBalls - priorSpins + 0.5,
    targetProbability,
  );
  // 明確な実測結果は過去データで逆転させず、迷う範囲だけベイズ値で補助する。
  const decisionProbability = live.aboveTarget < 0.1 || live.aboveTarget >= 0.9
    ? live.aboveTarget
    : posterior.aboveTarget;
  const action = actionFor(totalK, decisionProbability, prePlayStrong);
  const reasons = {
    collecting: `まずは${nextCheckpointK || 3}Kまで測ります。大当たりや出玉では判断しません。`,
    stop_candidate: `目標${targetRotation.toFixed(1)}回/Kを超える可能性が低めです。次の投資前に見直してください。`,
    compare: "良い・悪いを決めきれません。戦略マップの候補台と比べてください。",
    stop: `目標${targetRotation.toFixed(1)}回/Kを超える可能性が低いため、資金を守る判断です。`,
    continue: `目標${targetRotation.toFixed(1)}回/Kを超える可能性が高めです。次の固定地点まで続けます。`,
    continue_strong: `実測だけでも目標${targetRotation.toFixed(1)}回/Kを超える可能性が高い状態です。`,
  };

  return {
    action,
    actionLabel: ACTION_LABELS[action],
    trueBorder,
    targetMargin,
    targetRotation,
    normalSpins,
    totalK,
    rentBalls,
    observedRotation,
    nextCheckpointK,
    reachedCheckpointK,
    remainingK,
    remainingBalls,
    liveProbability: live.aboveTarget,
    bayesianProbability: posterior.aboveTarget,
    decisionProbability,
    low90: posterior.low90 * rentBalls,
    high90: posterior.high90 * rentBalls,
    posteriorMean: posterior.mean * rentBalls,
    prePlayStrong,
    priorEquivalentK,
    standardDeviationPerK,
    standardDeviationSource,
    reason: reasons[action],
  };
}

export function liveDecisionCheckpointText(decision) {
  if (!decision) return "判定データなし";
  if (decision.nextCheckpointK == null) return `${decision.reachedCheckpointK || 20}K確認済み`;
  return `次は${decision.nextCheckpointK}K・あと${decision.remainingK.toFixed(1)}K（約${decision.remainingBalls}玉）`;
}
