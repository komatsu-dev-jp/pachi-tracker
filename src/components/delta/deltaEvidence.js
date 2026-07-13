// 差玉・通常回転数・大当り回数から、機種ごとの予測回転率を推定する。
// Google Sheets には接続せず、保存済み pt_deltaScans だけを使う純粋関数。

const BALLS_PER_1K = 250;
const DEFAULT_BORDER = 18;
const DEFAULT_PRIOR_VARIANCE = 4;
const DEFAULT_STD_SCALE = 0.25;
const GRAPH_STEP_BALLS = 500;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sameText(a, b) {
  return String(a ?? "").trim() === String(b ?? "").trim();
}

function dataDate(value) {
  const match = String(value || "").match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export function findMachineSpec(machineName, customMachines = [], builtInMachines = []) {
  const name = String(machineName ?? "").trim();
  const master = (builtInMachines || []).find((machine) => sameText(machine?.name, name));
  const custom = (customMachines || []).find((machine) => sameText(machine?.name, name));
  if (master && custom) {
    const masterDate = dataDate(master.dataUpdatedAt);
    const customDate = dataDate(custom.dataUpdatedAt);
    if (masterDate && (!customDate || masterDate > customDate)) return master;
  }
  const candidates = [...(customMachines || []), ...(builtInMachines || [])]
    .filter((machine) => sameText(machine?.name, name));
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const score = (machine) =>
      (num(machine?.avgPayoutPerHit) > 0 ? 4 : 0) +
      (num(machine?.stdDev) > 0 ? 2 : 0) +
      (num(machine?.muraCoef) > 0 ? 1 : 0);
    return score(b) - score(a);
  })[0];
}

export function machineBorder(machine = {}) {
  return num(machine.border1K ?? machine.border?.["4.00"] ?? machine.border, DEFAULT_BORDER);
}

function percent(value) {
  const n = num(value);
  return n > 1 ? n / 100 : n;
}

function weightedPayout(rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const totalRate = rows.reduce((sum, row) => sum + Math.max(0, num(row?.rate)), 0);
  if (!(totalRate > 0)) return 0;
  return rows.reduce((sum, row) => sum + Math.max(0, num(row?.payout)) * Math.max(0, num(row?.rate)), 0) / totalRate;
}

function payoutFromRoundDist(text, spec1R) {
  const matches = [...String(text || "").matchAll(/(\d+(?:\.\d+)?)R[^0-9]*(\d+(?:\.\d+)?)%/gi)];
  if (!matches.length || !(num(spec1R) > 0)) return 0;
  const totalRate = matches.reduce((sum, match) => sum + num(match[2]), 0);
  if (!(totalRate > 0)) return 0;
  const avgRounds = matches.reduce((sum, match) => sum + num(match[1]) * num(match[2]), 0) / totalRate;
  return avgRounds * num(spec1R);
}

// P-EVIDENCE m_master と同じ考え方で、直接値がない旧機種も平均出玉を補完する。
export function resolveMachineStats(machine = {}) {
  let avgPayout = Math.max(0, num(machine.avgPayoutPerHit));
  let derived = false;
  if (!(avgPayout > 0)) {
    const heso = num(machine.hesoAvgPayout) || weightedPayout(machine.hesoDist);
    const right = Math.max(0, num(machine.rushAvgPayout));
    const entry = percent(machine.rushEntryRate);
    const cont = percent(machine.rushContinueRate);
    if (heso > 0 && right > 0 && entry > 0 && cont > 0 && cont < 1) {
      const averageRightHits = entry * (cont / (1 - cont));
      avgPayout = ((heso + averageRightHits * right) / (1 + averageRightHits)) * 0.9;
      derived = true;
    }
  }
  if (!(avgPayout > 0)) {
    avgPayout = payoutFromRoundDist(machine.roundDist, machine.spec1R);
    derived = avgPayout > 0;
  }
  const directStdDev = Math.max(0, num(machine.stdDev));
  const stdDev = directStdDev > 0 ? directStdDev : (avgPayout > 0 ? Math.max(3000, avgPayout * 4) : 0);
  return { avgPayout, stdDev, derived: derived || !(directStdDev > 0) };
}

export function estimateDeltaObservation(row = {}, machine = {}, options = {}) {
  const normalSpins = Math.max(0, num(row.normalSpins));
  const totalStarts = Math.max(0, num(row.totalStarts));
  const deltaBalls = num(row.val);
  const stats = resolveMachineStats(machine);
  const avgPayout = stats.avgPayout;
  const stdDev = stats.stdDev;

  if (normalSpins <= 0) return { valid: false, reason: "通常回転数なし" };
  if (totalStarts > 0 && avgPayout <= 0) return { valid: false, reason: "平均出玉なし" };

  // 差玉 = 払い出し - 投入玉 なので、投入玉 = 払い出し - 差玉。
  const estimatedInputBalls = totalStarts * avgPayout - deltaBalls;
  if (estimatedInputBalls < BALLS_PER_1K) return { valid: false, reason: "推定投入玉不足" };

  const observedRotation = normalSpins / (estimatedInputBalls / BALLS_PER_1K);
  const minRate = num(options.minRate, 5);
  const maxRate = num(options.maxRate, 45);
  if (observedRotation < minRate || observedRotation > maxRate) {
    return { valid: false, reason: "回転率が現実範囲外", observedRotation, estimatedInputBalls };
  }

  // 大当り出玉のブレと、グラフが500玉刻みで丸められる誤差を合算する。
  // stdScale=0.25 は P-EVIDENCE 過去1,645件の時系列検証で最小誤差だった値。
  const stdScale = num(options.stdScale, DEFAULT_STD_SCALE);
  const payoutVariance = totalStarts * (stdDev * stdScale) ** 2;
  const graphVariance = (num(options.graphStepBalls, GRAPH_STEP_BALLS) ** 2) / 12;

  return {
    valid: true,
    normalSpins,
    totalStarts,
    deltaBalls,
    estimatedInputBalls,
    observedRotation,
    inputVariance: payoutVariance + graphVariance,
    machineStatsDerived: stats.derived,
  };
}

export function collectDeltaRows(scans = [], filters = {}) {
  const rows = [];
  for (const scan of scans || []) {
    if (filters.storeId != null && String(scan?.storeId) !== String(filters.storeId)) continue;
    if (filters.storeName && !sameText(scan?.storeName, filters.storeName)) continue;
    for (const row of scan?.rows || []) {
      const machineName = row?.machineName || scan?.machineName || "";
      if (filters.machineName && !sameText(machineName, filters.machineName)) continue;
      if (filters.num != null && String(row?.num) !== String(filters.num)) continue;
      rows.push({
        ...row,
        machineName,
        date: scan?.date || "",
        createdAt: scan?.createdAt || "",
        storeId: scan?.storeId ?? null,
        storeName: scan?.storeName || "",
      });
    }
  }
  return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function buildDeltaEvidence(rows = [], machine = {}, options = {}) {
  const observations = (rows || [])
    .map((row) => ({ row, estimate: estimateDeltaObservation(row, machine, options) }))
    .filter((item) => item.estimate.valid);
  const border = machineBorder(machine);

  if (!observations.length) {
    return {
      hasEstimate: false,
      trueBorder: border,
      predictedRotation: border,
      confidence: 0,
      goodMachineScore: 0,
      observations: [],
      rejectedCount: (rows || []).length,
      grade: "データ不足",
    };
  }

  const totalSpins = observations.reduce((sum, item) => sum + item.estimate.normalSpins, 0);
  const totalInputBalls = observations.reduce((sum, item) => sum + item.estimate.estimatedInputBalls, 0);
  const totalInputVariance = observations.reduce((sum, item) => sum + item.estimate.inputVariance, 0);
  const observedRotation = totalSpins * BALLS_PER_1K / totalInputBalls;

  // 誤差伝播: rate = 250 * spins / input。
  const derivative = BALLS_PER_1K * totalSpins / (totalInputBalls ** 2);
  const standardError = Math.max(0.05, derivative * Math.sqrt(totalInputVariance));
  const observationVariance = standardError ** 2;
  const priorVariance = Math.max(0.01, num(options.priorVariance, DEFAULT_PRIOR_VARIANCE));
  const confidence = clamp(priorVariance / (priorVariance + observationVariance), 0, 1);
  const predictedRotation = observedRotation * confidence + border * (1 - confidence);
  const borderDifference = predictedRotation - border;
  const goodMachineScore = Math.max(0, borderDifference * confidence * 100);
  const predictedLow = Math.max(0, predictedRotation - 1.96 * standardError * confidence);
  const predictedHigh = predictedRotation + 1.96 * standardError * confidence;

  let grade = "回収注意";
  if (confidence < 0.2) grade = "データ収集中";
  else if (goodMachineScore >= 50) grade = "鉄板";
  else if (goodMachineScore >= 30) grade = "狙い";
  else if (goodMachineScore >= 10) grade = "候補";

  return {
    hasEstimate: true,
    trueBorder: border,
    observedRotation,
    predictedRotation,
    confidence,
    goodMachineScore,
    borderDifference,
    predictedLow,
    predictedHigh,
    standardError,
    totalSpins,
    totalInputBalls,
    observationCount: observations.length,
    rejectedCount: (rows || []).length - observations.length,
    observations,
    grade,
  };
}

export { BALLS_PER_1K, DEFAULT_PRIOR_VARIANCE, DEFAULT_STD_SCALE };
