// 遊タイム専用の純粋計算モジュール。
// 通常期待値の心臓部（src/logic.js）とは分離し、台選び・実戦中で同じ式を使う。

const finiteNumber = (value) => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function deriveNormalExpectedNetBalls({ spec1R, specAvgRounds, specSapo } = {}) {
  const oneRound = finiteNumber(spec1R);
  const avgRounds = finiteNumber(specAvgRounds);
  const sapo = finiteNumber(specSapo) ?? 0;
  if (!(oneRound > 0)) return 0;
  // calcPreciseEV と同じく平均総Rが無い場合は30Rを使用する。
  const effectiveRounds = avgRounds > 0 ? avgRounds : 30;
  return Math.max(0, oneRound * effectiveRounds + sapo);
}

function validateInput(input = {}) {
  const probabilityDenom = finiteNumber(input.probabilityDenom);
  const triggerLowSpins = finiteNumber(input.triggerLowSpins);
  const currentLowSpins = finiteNumber(input.currentLowSpins);
  const start1K = finiteNumber(input.start1K);
  const normalExpectedNetBalls = finiteNumber(input.normalExpectedNetBalls);
  const yutimeExpectedNetBalls = finiteNumber(input.yutimeExpectedNetBalls);
  const rentBalls = finiteNumber(input.rentBalls);
  const exRate = finiteNumber(input.exRate);
  const budgetYen = finiteNumber(input.budgetYen);

  const missing = [];
  if (!(probabilityDenom > 1)) missing.push("probabilityDenom");
  if (!(triggerLowSpins > 0)) missing.push("triggerLowSpins");
  if (currentLowSpins == null || currentLowSpins < 0) missing.push("currentLowSpins");
  if (!(start1K > 0)) missing.push("start1K");
  if (!(normalExpectedNetBalls > 0)) missing.push("normalExpectedNetBalls");
  // 0玉は境界値として有効。null/未入力だけを不足とする。
  if (yutimeExpectedNetBalls == null || yutimeExpectedNetBalls < 0) missing.push("yutimeExpectedNetBalls");
  if (!(rentBalls > 0)) missing.push("rentBalls");
  if (!(exRate > 0)) missing.push("exRate");

  return {
    valid: missing.length === 0,
    missing,
    values: {
      probabilityDenom,
      triggerLowSpins: Math.max(0, Math.round(triggerLowSpins || 0)),
      currentLowSpins: Math.max(0, Math.round(currentLowSpins || 0)),
      start1K,
      normalExpectedNetBalls,
      yutimeExpectedNetBalls,
      rentBalls,
      exRate,
      budgetYen: budgetYen == null ? null : Math.max(0, budgetYen),
    },
  };
}

function calculateAt(values) {
  const {
    probabilityDenom,
    triggerLowSpins,
    currentLowSpins,
    start1K,
    normalExpectedNetBalls,
    yutimeExpectedNetBalls,
    rentBalls,
    exRate,
  } = values;
  const current = Math.min(triggerLowSpins, currentLowSpins);
  const remainingSpins = Math.max(0, triggerLowSpins - current);
  const hitProbability = 1 / probabilityDenom;
  const missProbability = 1 - hitProbability;
  const reachProbability = Math.pow(missProbability, remainingSpins);
  const normalHitProbability = 1 - reachProbability;
  // min(通常当たりまでの回転数, 遊タイムまでの残り回転数) の期待値。
  const expectedSpins = remainingSpins === 0
    ? 0
    : normalHitProbability / hitProbability;

  const ballValueYen = 1000 / exRate;
  const expectedGrossBalls =
    normalHitProbability * normalExpectedNetBalls +
    reachProbability * yutimeExpectedNetBalls;
  const expectedReturnYen = expectedGrossBalls * ballValueYen;

  const cashCostPerSpin = 1000 / start1K;
  const heldCostPerSpin = (rentBalls * ballValueYen) / start1K;
  const expectedInvestmentCash = expectedSpins * cashCostPerSpin;
  const expectedInvestmentHeld = expectedSpins * heldCostPerSpin;
  // 途中で通常当たりせず、遊タイム発動回転まで全て回した場合に必要な金額。
  const arrivalInvestmentCash = remainingSpins * cashCostPerSpin;
  const arrivalInvestmentHeld = remainingSpins * heldCostPerSpin;
  const cashEV = expectedReturnYen - expectedInvestmentCash;
  const heldEV = expectedReturnYen - expectedInvestmentHeld;

  return {
    currentLowSpins: current,
    remainingSpins,
    hitProbability,
    reachProbability,
    normalHitProbability,
    expectedSpins,
    expectedGrossBalls,
    expectedReturnYen,
    ballValueYen,
    cashCostPerSpin,
    heldCostPerSpin,
    expectedInvestmentCash,
    expectedInvestmentHeld,
    arrivalInvestmentCash,
    arrivalInvestmentHeld,
    cashEV,
    heldEV,
  };
}

export function calculateYutimeEV(input = {}) {
  const checked = validateInput(input);
  if (!checked.valid) {
    return {
      valid: false,
      status: "missing-input",
      missing: checked.missing,
      breakEvenLowSpinsCash: null,
      breakEvenLowSpinsHeld: null,
    };
  }

  const base = calculateAt(checked.values);
  let breakEvenLowSpinsCash = null;
  let breakEvenLowSpinsHeld = null;
  for (let spins = 0; spins <= checked.values.triggerLowSpins; spins += 1) {
    const point = calculateAt({ ...checked.values, currentLowSpins: spins });
    if (breakEvenLowSpinsCash == null && point.cashEV >= 0) breakEvenLowSpinsCash = spins;
    if (breakEvenLowSpinsHeld == null && point.heldEV >= 0) breakEvenLowSpinsHeld = spins;
    if (breakEvenLowSpinsCash != null && breakEvenLowSpinsHeld != null) break;
  }

  const playMode = input.playMode === "mochi" || input.playMode === "chodama"
    ? input.playMode
    : "cash";
  const selectedEV = playMode === "cash" ? base.cashEV : base.heldEV;
  const selectedInvestment = playMode === "cash"
    ? base.expectedInvestmentCash
    : base.expectedInvestmentHeld;
  const selectedArrivalInvestment = playMode === "cash"
    ? base.arrivalInvestmentCash
    : base.arrivalInvestmentHeld;
  const selectedCostPerSpin = playMode === "cash"
    ? base.cashCostPerSpin
    : base.heldCostPerSpin;
  const budgetYen = checked.values.budgetYen;
  const affordableSpins = budgetYen == null
    ? null
    : Math.max(0, Math.floor(budgetYen / selectedCostPerSpin));
  const budgetCoveredSpins = affordableSpins == null
    ? null
    : Math.min(base.remainingSpins, affordableSpins);
  const budgetShortfallYen = budgetYen == null
    ? null
    : Math.max(0, selectedArrivalInvestment - budgetYen);
  const budgetSurplusYen = budgetYen == null
    ? null
    : Math.max(0, budgetYen - selectedArrivalInvestment);

  return {
    valid: true,
    status: selectedEV >= 0 ? "positive" : "negative",
    missing: [],
    playMode,
    selectedEV,
    selectedInvestment,
    selectedArrivalInvestment,
    affordableSpins,
    budgetCoveredSpins,
    budgetShortfallYen,
    budgetSurplusYen,
    budgetCanReach: budgetYen == null ? null : budgetShortfallYen <= 0,
    breakEvenLowSpinsCash,
    breakEvenLowSpinsHeld,
    selectedBreakEvenLowSpins: playMode === "cash" ? breakEvenLowSpinsCash : breakEvenLowSpinsHeld,
    ...base,
  };
}

// rotRows を唯一の回転履歴として、現在の低確率回転数を導出する。
// 新形式は start.yutimeLowSpins + 以降の data.thisRot、旧形式は最新 cumRot を使う。
export function deriveCurrentLowProbabilitySpins(rotRows = []) {
  const rows = Array.isArray(rotRows) ? rotRows : [];
  if (rows.length === 0) return 0;

  let latestStartIndex = -1;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i]?.type === "start") {
      latestStartIndex = i;
      break;
    }
  }

  const start = latestStartIndex >= 0 ? rows[latestStartIndex] : null;
  const explicitBase = finiteNumber(start?.yutimeLowSpins);
  if (explicitBase != null) {
    const progress = rows.slice(latestStartIndex + 1).reduce((sum, row) => {
      if (row?.type !== "data") return sum;
      return sum + Math.max(0, finiteNumber(row.thisRot) || 0);
    }, 0);
    return Math.max(0, Math.round(explicitBase + progress));
  }

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const cumRot = finiteNumber(rows[i]?.cumRot);
    if (cumRot != null) return Math.max(0, Math.round(cumRot));
  }
  return 0;
}

export function normalizeYutimeSpec(spec) {
  if (!spec || typeof spec !== "object") return null;
  const triggerLowSpins = finiteNumber(spec.triggerLowSpins);
  if (!(triggerLowSpins > 0)) return null;
  const expected = finiteNumber(spec.expectedNetBalls);
  return {
    triggerLowSpins: Math.max(0, Math.round(triggerLowSpins)),
    durationSpins: Math.max(0, Math.round(finiteNumber(spec.durationSpins) || 0)),
    expectedNetBalls: expected != null && expected >= 0 ? expected : null,
    durationLabel: String(spec.durationLabel || "").trim(),
    benefit: String(spec.benefit || "").trim(),
    sourceUrl: String(spec.sourceUrl || "").trim(),
    verifiedAt: String(spec.verifiedAt || "").trim(),
    source: String(spec.source || "master"),
  };
}

export function createYutimeSessionFromMachine(machine, { assumedStart1K = 0 } = {}) {
  const spec = normalizeYutimeSpec(machine?.yutime);
  if (!spec) return null;
  return {
    ...spec,
    machineName: String(machine?.name || "").trim(),
    assumedStart1K: Math.max(0, finiteNumber(assumedStart1K) || finiteNumber(machine?.border1K) || 0),
    // 搭載機を選んだだけでは表示しない。計算画面で狙い開始を確定した時だけ true にする。
    targetingEnabled: false,
    source: spec.source || "master",
  };
}

export function isYutimeTargetingSession(session) {
  return Boolean(
    session
    && Number(session.triggerLowSpins) > 0
    && session.targetingEnabled === true
  );
}

// 遊タイム計算から記録を開始するとき、既存セッションをどう扱うかを決める。
// 記録が空なら誤って残った前機種を上書きし、入力済みなら台移動として保存する。
export function resolveYutimeStartAction({
  sessionStarted = false,
  currentMachineName = "",
  nextMachineName = "",
  rotRows = [],
  jpLog = [],
} = {}) {
  if (!sessionStarted) return "start";

  const hasRecordedActivity = (Array.isArray(rotRows) && rotRows.some((row) => row?.type !== "start"))
    || (Array.isArray(jpLog) && jpLog.length > 0);
  if (!hasRecordedActivity) return "replace";

  const currentName = String(currentMachineName || "").trim();
  const nextName = String(nextMachineName || "").trim();
  if (currentName && nextName && currentName !== nextName) return "move";
  return "update";
}
