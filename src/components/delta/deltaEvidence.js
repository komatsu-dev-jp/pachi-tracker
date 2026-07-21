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

function normalizeMachineName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s・･:：/／\\()（）\u005b\u005d［］【】「」『』.,，。_-]/g, "");
}

function machineNameVariants(machine = {}) {
  return [machine?.name, ...(Array.isArray(machine?.aliases) ? machine.aliases : [])]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function machineNameScore(machine, inputName) {
  const input = String(inputName ?? "").trim();
  const normalizedInput = normalizeMachineName(input);
  if (!normalizedInput) return 0;
  let score = 0;
  for (const variant of machineNameVariants(machine)) {
    if (variant === input) return 3;
    const normalizedVariant = normalizeMachineName(variant);
    if (normalizedVariant === normalizedInput) score = Math.max(score, 2);
    else if (
      normalizedVariant.length >= 6 && normalizedInput.length >= 6 &&
      (normalizedVariant.includes(normalizedInput) || normalizedInput.includes(normalizedVariant))
    ) score = Math.max(score, 1);
  }
  return score;
}

export function findMachineSpec(machineName, customMachines = [], builtInMachines = []) {
  const name = String(machineName ?? "").trim();
  const scored = [
    ...(customMachines || []).map((machine) => ({ machine, source: "custom", score: machineNameScore(machine, name) })),
    ...(builtInMachines || []).map((machine) => ({ machine, source: "master", score: machineNameScore(machine, name) })),
  ].filter((item) => item.score > 0);
  if (!scored.length) return null;

  const highestScore = Math.max(...scored.map((item) => item.score));
  const matched = scored.filter((item) => item.score === highestScore);
  // 部分一致は型式違いの誤照合を避けるため、同じ正規化機種名に絞れる場合だけ採用する。
  if (highestScore === 1) {
    const canonicalNames = new Set(matched.map((item) => normalizeMachineName(item.machine?.name)));
    if (canonicalNames.size !== 1) return null;
  }

  const master = matched.find((item) => item.source === "master")?.machine;
  const custom = matched.find((item) => item.source === "custom")?.machine;
  if (master && custom) {
    const masterDate = dataDate(master.dataUpdatedAt);
    const customDate = dataDate(custom.dataUpdatedAt);
    if (masterDate && (!customDate || masterDate > customDate)) return master;
  }
  const candidates = matched.map((item) => item.machine);
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const score = (machine) =>
      (num(machine?.avgPayoutPerHit) > 0 ? 4 : 0) +
      (num(machine?.stdDev) > 0 ? 2 : 0) +
      (num(machine?.muraCoef) > 0 ? 1 : 0);
    return score(b) - score(a);
  })[0];
}

// 解析結果1台分を、機種マスタ照合から予測回転率まで一続きで評価する。
// UI側は hasEstimate / reason を見るだけで「計算済み」か「不足項目あり」かを表示できる。
export function buildRowDeltaEvidence(row = {}, customMachines = [], builtInMachines = [], options = {}) {
  const machineName = String(row?.machineName || options.machineName || "").trim();
  if (!machineName) {
    return { hasEstimate: false, machine: null, estimate: null, evidence: null, reason: "機種名なし" };
  }
  const machine = findMachineSpec(machineName, customMachines, builtInMachines);
  if (!machine) {
    return { hasEstimate: false, machine: null, estimate: null, evidence: null, reason: "機種マスタ未登録" };
  }
  const estimate = estimateDeltaObservation(row, machine, options);
  if (!estimate.valid) {
    return { hasEstimate: false, machine, estimate, evidence: null, reason: estimate.reason || "計算データ不足" };
  }
  const evidence = buildDeltaEvidence([row], machine, options);
  return {
    hasEstimate: evidence.hasEstimate,
    machine,
    estimate,
    evidence,
    reason: evidence.hasEstimate ? "" : "計算データ不足",
  };
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
  const rawDelta = row?.val;
  const deltaBalls = Number(rawDelta);
  const stats = resolveMachineStats(machine);
  const avgPayout = stats.avgPayout;
  const stdDev = stats.stdDev;

  if (row?.status === "bounded") return { valid: false, reason: "差玉は境界到達記録" };
  if (row?.status === "review" && row?.reviewConfirmed !== true) {
    return { valid: false, reason: "差玉の確認待ち" };
  }
  if (row?.status === "failed" || rawDelta === null || rawDelta === undefined || rawDelta === ""
    || !Number.isFinite(deltaBalls)) {
    return { valid: false, reason: "確定差玉なし" };
  }
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
  // 予測回転率は「実測×信頼度 + ボーダー×(1-信頼度)」の合成推定なので、
  // 区間幅も合成推定の分散 conf²·SE² + (1-conf)²·priorVariance（ベイズ事後分散）から取る。
  // 従来の SE×conf は stdDev 由来の不確かさを SE と信頼度の両方に二重に掛けており、
  // ブレが大きい機種ほど予測レンジが狭く見える逆転が起きていた。
  const posteriorSd = Math.sqrt((confidence * standardError) ** 2 + ((1 - confidence) ** 2) * priorVariance);
  const predictedLow = Math.max(0, predictedRotation - 1.96 * posteriorSd);
  const predictedHigh = predictedRotation + 1.96 * posteriorSd;

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
