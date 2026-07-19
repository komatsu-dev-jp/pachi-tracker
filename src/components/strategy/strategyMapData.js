// 保存済み差玉解析（pt_deltaScans）から戦略マップ表示データを作る純粋関数。
// 仮データ・乱数は使わない。Google Sheets への通信も行わない。

import { machineDB } from "../../machineDB.js";
import {
  buildDeltaEvidence,
  collectDeltaRows,
  findMachineSpec,
} from "../delta/deltaEvidence.js";
import {
  buildPEvidenceAnalytics,
  normalCdf,
  outwardPercentBand,
} from "../evidence/pevidenceAnalytics.js";
import { getStoreIslands } from "../select/hallMapSelectors.js";

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function classify(borderDiff, confidence) {
  if (confidence < 20) return "nodata";
  if (borderDiff >= 0.5) return "strong";
  if (borderDiff >= -0.4) return "watch";
  return "weak";
}

function scoreOf(machine) {
  return Number(machine.goodMachineScore || 0);
}

function evPerHourOf(rotation, border) {
  if (!(rotation > 0) || !(border > 0)) return 0;
  const evPerK = ((rotation - border) / border) * 1000;
  return Math.round(evPerK * (210 / rotation));
}

const PLAN_STYLE_LABELS = Object.freeze({
  stable: "安定重視",
  balanced: "バランス",
  ev: "期待値優先",
  skip: "見送り",
});

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function buildStrategyPlanContext({
  date = "",
  dailyResearchPlans = {},
  monthlyPlayPlans = {},
  spinsPerHour = 210,
  defaultHours = 6,
  defaultCashLimit = 0,
  ballValueYen = 4,
} = {}) {
  const dateKey = String(date || "");
  const daily = dailyResearchPlans?.[dateKey] || null;
  const monthly = monthlyPlayPlans?.[dateKey.slice(0, 7)] || null;
  const styleId = daily?.style || monthly?.baseStyle || "balanced";
  const isSkip = styleId === "skip";
  const plannedHours = isSkip ? 0 : positive(daily?.standardHours ?? monthly?.standardHours, positive(defaultHours, 6));
  const hourlySpins = positive(spinsPerHour, 210);
  const cashLimit = Math.max(0, Number(daily?.cashLimit ?? monthly?.cashLimit ?? defaultCashLimit) || 0);
  const source = daily ? "daily" : monthly ? "monthly" : "default";
  return {
    date: dateKey,
    source,
    sourceLabel: daily ? "本日プラン" : monthly ? "月間プラン" : "標準設定",
    hasSavedPlan: Boolean(daily || monthly),
    styleId,
    styleLabel: PLAN_STYLE_LABELS[styleId] || PLAN_STYLE_LABELS.balanced,
    isSkip,
    plannedHours,
    spinsPerHour: hourlySpins,
    sessionSpins: isSkip ? 0 : Math.round(plannedHours * hourlySpins),
    cashLimit,
    ballValueYen: positive(ballValueYen, 4),
  };
}

function emptyMap(playingNum, planHandoff = null, plan = null) {
  return {
    source: "delta",
    machineName: "差玉データなし",
    total: 0,
    border: 0,
    islands: [],
    all: [],
    candidates: [],
    top5: [],
    kpi: { evPerHour: 0, rot: 0, confidence: 0, candidates: 0 },
    leadId: null,
    playingNum,
    islandAvgRot: () => 0,
    analytics: null,
    portfolio: { plan: [], totalHours: 0, expectedProfit: 0 },
    aiProfile: { overall: { rate: 0, count: 0 }, profiles: [] },
    nextMap: [],
    islandStats: [],
    planHandoff,
    plan,
    planMatch: { matched: 0, total: planHandoff?.targets?.length || 0 },
  };
}

function scanStoreKey(scan) {
  return String(scan?.storeId ?? scan?.storeName ?? "");
}

function latestScanGroup(scans, selectedStoreId = null) {
  const valid = (scans || []).filter((scan) => Array.isArray(scan?.rows) && scan.rows.length);
  const scoped = selectedStoreId == null
    ? valid
    : valid.filter((scan) => scanStoreKey(scan) === String(selectedStoreId));
  if (!scoped.length) return [];
  const latest = [...scoped].sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || "")) ||
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  )[0];
  return scoped.filter((scan) =>
    scanStoreKey(scan) === scanStoreKey(latest) &&
    String(scan.date || "") === String(latest.date || "")
  );
}

function localDateKey(value = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nextDateKey(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + 1);
  return localDateKey(date);
}

function candidateFromKey(key) {
  const parts = String(key || "").split("::");
  return {
    key: String(key || ""),
    name: parts.length >= 2 ? parts.at(-2) : String(key || ""),
    modelName: parts.length >= 3 ? parts.at(-1) : "",
  };
}

function mergeSnapshotCandidates(dailyPlan, monthlyPlan) {
  const rows = [
    ...(Array.isArray(dailyPlan?.candidateSnapshot?.candidates) ? dailyPlan.candidateSnapshot.candidates : []),
    ...(Array.isArray(monthlyPlan?.candidateSnapshot?.candidates) ? monthlyPlan.candidateSnapshot.candidates : []),
  ];
  const byKey = new Map();
  for (const row of rows) {
    const key = String(row?.key || "");
    if (key && !byKey.has(key)) byKey.set(key, row);
  }
  return byKey;
}

/**
 * 月間・日次の System v2 プランを、戦略マップが扱える1つの引き継ぎ情報へまとめる。
 * 日次に未設定の項目は月間から継承し、旧形式のプランしかない場合も従来どおり null を返す。
 */
export function resolveStrategyPlanHandoff({
  monthlyPlayPlans = {},
  dailyResearchPlans = {},
  now = new Date(),
  targetDate = "",
  availableStoreIds = null,
} = {}) {
  const todayKey = localDateKey(now);
  const tomorrowKey = nextDateKey(now);
  const requestedDateKey = localDateKey(targetDate);
  // Home の「店舗データと期待値を確認する」は翌日の準備導線なので、翌日プランを先に使う。
  // 翌日分がなければ、戦略タブを直接開いた場合に備えて当日分へフォールバックする。
  const dailyKey = requestedDateKey
    ? (dailyResearchPlans?.[requestedDateKey] ? requestedDateKey : "")
    : dailyResearchPlans?.[tomorrowKey]
      ? tomorrowKey
      : dailyResearchPlans?.[todayKey]
        ? todayKey
        : "";
  const dailyPlan = dailyKey ? dailyResearchPlans[dailyKey] : null;
  const monthKey = (dailyKey || requestedDateKey || todayKey).slice(0, 7);
  const monthlyPlan = monthlyPlayPlans?.[monthKey] || null;
  if (!dailyPlan && !monthlyPlan) return null;

  const dailySkip = dailyPlan?.status === "skip" || dailyPlan?.style === "skip" || dailyPlan?.researchPackageId === "skip";
  const researchTargets = dailySkip ? null : dailyPlan?.researchTargets || monthlyPlan?.researchTargets || null;
  const primaryKey = String(researchTargets?.primaryMachineKey || "");
  const backupKeys = Array.isArray(researchTargets?.backupMachineKeys)
    ? [...new Set(researchTargets.backupMachineKeys.map(String).filter(Boolean))].filter((key) => key !== primaryKey)
    : [];
  const candidateByKey = mergeSnapshotCandidates(dailyPlan, monthlyPlan);
  const makeTarget = (key, role, priority) => {
    const snapshot = candidateByKey.get(key);
    const fallback = candidateFromKey(key);
    return {
      key,
      role,
      priority,
      name: String(snapshot?.name || fallback.name || ""),
      modelName: String(snapshot?.modelName || fallback.modelName || ""),
    };
  };
  const targets = [
    ...(primaryKey ? [makeTarget(primaryKey, "primary", 0)] : []),
    ...backupKeys.map((key, index) => makeTarget(key, "backup", index + 1)),
  ];
  const requestedStoreId = dailyPlan?.defaultStoreId ?? monthlyPlan?.defaultStoreId ?? null;
  const hasSystemV2Fields = Boolean(requestedStoreId != null || targets.length || dailyPlan?.candidateSnapshot || monthlyPlan?.candidateSnapshot);
  if (!hasSystemV2Fields) return null;

  const hasValidStore = requestedStoreId != null && (
    !Array.isArray(availableStoreIds)
    || availableStoreIds.some((storeId) => String(storeId) === String(requestedStoreId))
  );

  const savedStatus = dailySkip
    ? "skip"
    : dailyPlan?.status || monthlyPlan?.status || "";
  const status = !dailySkip && !hasValidStore ? "needs-review" : savedStatus;
  const minExpectedValuePerHour = Math.max(0, Number(
    dailyPlan?.minExpectedValuePerHour ?? monthlyPlan?.minExpectedValuePerHour ?? 0
  ) || 0);
  const goalBackcast = dailyPlan?.goalBackcast || monthlyPlan?.goalBackcast || null;

  return {
    source: dailyPlan ? "daily" : "monthly",
    dateKey: dailyKey || "",
    monthKey,
    defaultStoreId: hasValidStore ? requestedStoreId : null,
    requestedStoreId,
    hasValidStore,
    packageId: dailyPlan?.researchPackageId
      || dailyPlan?.style
      || monthlyPlan?.researchPackageId
      || monthlyPlan?.baseStyle
      || "",
    status,
    canPrioritize: status === "research-ready" && hasValidStore && Boolean(primaryKey),
    minExpectedValuePerHour,
    requiredUnitPrice: goalBackcast?.requiredUnitPrice != null && Number.isFinite(Number(goalBackcast.requiredUnitPrice))
      ? Number(goalBackcast.requiredUnitPrice)
      : null,
    requiredSessionEv: goalBackcast?.requiredSessionEv != null && Number.isFinite(Number(goalBackcast.requiredSessionEv))
      ? Number(goalBackcast.requiredSessionEv)
      : null,
    targets,
    primary: targets.find((target) => target.role === "primary") || null,
    backups: targets.filter((target) => target.role === "backup"),
  };
}

export function applyStrategyPlanEntryContext(planHandoff, entryContext) {
  if (!planHandoff) return null;
  if (!entryContext || typeof entryContext !== "object") return planHandoff;
  const finiteContextValue = (value) => value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  const hasMinimum = Object.prototype.hasOwnProperty.call(entryContext, "minExpectedValuePerHour")
    && Number.isFinite(Number(entryContext.minExpectedValuePerHour));
  const hasRequiredUnitPrice = Object.prototype.hasOwnProperty.call(entryContext, "requiredUnitPrice");
  const hasRequiredSessionEv = Object.prototype.hasOwnProperty.call(entryContext, "requiredSessionEv");

  return {
    ...planHandoff,
    minExpectedValuePerHour: hasMinimum
      ? Math.max(0, Number(entryContext.minExpectedValuePerHour))
      : planHandoff.minExpectedValuePerHour,
    requiredUnitPrice: hasRequiredUnitPrice
      ? finiteContextValue(entryContext.requiredUnitPrice)
      : planHandoff.requiredUnitPrice,
    requiredSessionEv: hasRequiredSessionEv
      ? finiteContextValue(entryContext.requiredSessionEv)
      : planHandoff.requiredSessionEv,
  };
}

function normalizeMachineIdentity(value) {
  return String(value || "").trim().toLocaleLowerCase("ja-JP");
}

function planTargetForMachine(machineName, planHandoff, machineSpec = null) {
  if (!planHandoff?.canPrioritize) return null;
  const machineIdentities = new Set([
    machineName,
    machineSpec?.name,
    machineSpec?.modelName,
    ...(Array.isArray(machineSpec?.aliases) ? machineSpec.aliases : []),
  ].map(normalizeMachineIdentity).filter(Boolean));
  if (!machineIdentities.size) return null;
  return (planHandoff?.targets || []).find((target) => (
    [target?.name, target?.modelName]
      .map(normalizeMachineIdentity)
      .filter(Boolean)
      .some((identity) => machineIdentities.has(identity))
  )) || null;
}

function compareStrategyPriority(a, b) {
  const goalGap = Number(!a.goalEligible) - Number(!b.goalEligible);
  const aPriority = Number.isFinite(a.planPriority) ? a.planPriority : Number.POSITIVE_INFINITY;
  const bPriority = Number.isFinite(b.planPriority) ? b.planPriority : Number.POSITIVE_INFINITY;
  return goalGap || aPriority - bPriority || b.score - a.score || b.confidence - a.confidence || b.evPerHour - a.evPerHour;
}

function historyFor(scans, machineName, num, machine) {
  const byDate = new Map();
  for (const row of collectDeltaRows(scans, { machineName, num })) {
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .slice(-7)
    .map(([, rows]) => round1(buildDeltaEvidence(rows, machine).predictedRotation));
}

function islandGrade(goodRate) {
  if (goodRate >= 0.5) return "A-";
  if (goodRate >= 0.38) return "B+";
  if (goodRate >= 0.28) return "B";
  if (goodRate >= 0.18) return "C+";
  return "C";
}

function summarizeIsland(island) {
  const list = island.machines;
  const strong = list.filter((machine) => machine.verdict === "strong");
  const goodRate = list.length ? strong.length / list.length : 0;
  const best = [...list].sort((a, b) => b.score - a.score)[0] || null;
  return {
    ...island,
    grade: islandGrade(goodRate),
    goodRate: Math.round(goodRate * 100),
    candidates: strong.length,
    evDensity: strong.length
      ? Math.round(strong.reduce((sum, machine) => sum + machine.evPerHour, 0) / strong.length)
      : 0,
    strongZone: best ? `${best.num}番周辺` : "—",
  };
}

// 島マップ管理で登録した順番と台番号範囲を、分析結果へ重ねる。
// 分析データがない台も画面上では灰色で残せるよう、start/end を必ず返す。
function applyHallLayout(analyzedIslands, hallIslands) {
  if (!hallIslands.length) return analyzedIslands;
  const used = new Set();
  const laidOut = hallIslands.map((layout, order) => {
    const matched = analyzedIslands.find((island) => {
      if (used.has(island.id)) return false;
      if (String(island.name) === String(layout.name)) return true;
      return island.machines.some((machine) => {
        const num = Number(machine.num);
        const machineMatches = !layout.machineName || machine.machineName === layout.machineName;
        return machineMatches && num >= layout.start && num <= layout.end;
      });
    });
    if (matched) used.add(matched.id);
    return {
      ...(matched || summarizeIsland({ id: layout.name || layout.id, name: layout.name, machines: [] })),
      layoutId: layout.id,
      name: layout.name || matched?.name || `島${order + 1}`,
      machineName: layout.machineName || matched?.machineName || "",
      start: layout.start,
      end: layout.end,
      layoutOrder: order,
      registeredLayout: true,
    };
  });
  const extras = analyzedIslands
    .filter((island) => !used.has(island.id))
    .map((island, index) => ({
      ...island,
      end: Math.max(...island.machines.map((machine) => Number(machine.num) || 0)),
      layoutOrder: laidOut.length + index,
      registeredLayout: false,
    }));
  return [...laidOut, ...extras];
}

export function buildStrategyMap({
  playingNum = null,
  liveDecision = null,
  scans = [],
  customMachines = [],
  hallMaps = {},
  selectedStoreId = null,
  planHandoff = null,
  plan = null,
} = {}) {
  const currentScans = latestScanGroup(scans, selectedStoreId);
  if (!currentScans.length) return emptyMap(playingNum, planHandoff, plan);

  const analysisStoreId = currentScans[0]?.storeId ?? selectedStoreId;
  const hallIslands = getStoreIslands(hallMaps, analysisStoreId);
  // ポートフォリオ・翌日予測に他店舗の台が混ざらないよう、
  // 解析対象は表示中の店舗（最新スキャンの店舗）の履歴に限定する。
  const analysisStoreKey = String(currentScans[0]?.storeId ?? currentScans[0]?.storeName ?? "");
  const storeScans = (scans || []).filter((scan) =>
    String(scan?.storeId ?? scan?.storeName ?? "") === analysisStoreKey
  );
  const analytics = buildPEvidenceAnalytics({
    scans: storeScans,
    customMachines,
    islands: hallIslands,
    params: plan ? {
      spinsPerHour: plan.spinsPerHour,
      sessionSpins: plan.sessionSpins,
      portfolioHours: plan.plannedHours,
      ballValueYen: plan.ballValueYen,
    } : {},
  });
  const analyticsByMachine = new Map(analytics.latestRows.map((item) => [
    `${item.store}___${item.machineName}___${item.num}`,
    item,
  ]));

  const currentRows = currentScans.flatMap((scan) =>
    (scan.rows || []).map((row) => ({
      ...row,
      machineName: row.machineName || scan.machineName || "",
      island: row.island || `${row.machineName || scan.machineName || "未分類"}島`,
      storeId: scan.storeId,
      storeName: scan.storeName,
    }))
  );
  const uniqueRows = new Map();
  for (const row of currentRows) uniqueRows.set(`${row.machineName}:${row.num}`, row);

  const islandMap = new Map();
  for (const row of uniqueRows.values()) {
    const machineName = row.machineName;
    const machineSpec = findMachineSpec(machineName, customMachines, machineDB);
    if (!machineSpec) continue;
    const historyRows = collectDeltaRows(storeScans, {
      storeId: row.storeId,
      storeName: row.storeId == null ? row.storeName : "",
      machineName,
      num: row.num,
    });
    const evidence = buildDeltaEvidence(historyRows, machineSpec);
    const rowStore = String(row.storeId ?? row.storeName ?? "").trim();
    const pe = analyticsByMachine.get(`${rowStore}___${machineName}___${String(row.num).replace(/_旧.*/, "").trim()}`);
    const predictedRotation = pe?.valid ? pe.predictedRotation : evidence.predictedRotation;
    const trueBorder = pe?.valid ? pe.border : evidence.trueBorder;
    const confidence = pe?.valid ? pe.confidence : evidence.confidence;
    const confidencePct = Math.round(confidence * 100);
    const borderDiff = round1(pe?.valid ? pe.borderDifference : (evidence.borderDifference || 0));
    const verdict = pe?.valid ? pe.verdict : classify(borderDiff, confidencePct);
    const islandName = row.island || `${machineName}島`;
    const islandId = islandName;
    // スパークラインも表示中店舗の履歴だけを使う（他店舗の同番号を混ぜない）
    const history = historyFor(storeScans, machineName, row.num, machineSpec);
    const isPlaying = playingNum != null && String(row.num) === String(playingNum);
    // この台・この店舗の直接観測区間を、予定時間の収支シナリオへ使う。
    // 長期学習側の区間は釘変化検知用の累積誤差も含むため、役割を分ける。
    const scenarioLowRotation = evidence.hasEstimate ? evidence.predictedLow : pe?.predictedLow;
    const scenarioHighRotation = evidence.hasEstimate ? evidence.predictedHigh : pe?.predictedHigh;
    const lowUnitPrice = scenarioLowRotation > 0 && trueBorder > 0 ? 1000 / trueBorder - 1000 / scenarioLowRotation : null;
    const highUnitPrice = scenarioHighRotation > 0 && trueBorder > 0 ? 1000 / trueBorder - 1000 / scenarioHighRotation : null;
    const scenarioHourlyLow = lowUnitPrice == null ? null : Math.round(lowUnitPrice * analytics.params.spinsPerHour);
    const scenarioHourlyHigh = highUnitPrice == null ? null : Math.round(highUnitPrice * analytics.params.spinsPerHour);
    const scenarioDailyLow = lowUnitPrice == null ? null : Math.round(lowUnitPrice * analytics.params.sessionSpins);
    const scenarioDailyHigh = highUnitPrice == null ? null : Math.round(highUnitPrice * analytics.params.sessionSpins);
    const scenarioChanceBand = pe?.profitChanceStatus === "ready" && pe?.dailyRisk > 0 && scenarioDailyLow != null && scenarioDailyHigh != null
      ? outwardPercentBand(normalCdf(scenarioDailyLow / pe.dailyRisk), normalCdf(scenarioDailyHigh / pe.dailyRisk))
      : null;
    const planTarget = planTargetForMachine(machineName, planHandoff, machineSpec);
    const evPerHour = pe?.valid ? pe.hourly : evPerHourOf(predictedRotation, trueBorder);
    const minPlanEv = Math.max(0, Number(planHandoff?.minExpectedValuePerHour) || 0);
    const hasPlanEvidence = verdict !== "nodata";
    const goalEligible = planHandoff ? Boolean(hasPlanEvidence && evPerHour >= minPlanEv) : true;
    const planEligible = Boolean(planTarget && goalEligible);
    const machine = {
      id: `m-${machineName}-${row.num}`,
      num: Number(row.num) || row.num,
      islandId,
      machineName,
      rot: round1(predictedRotation),
      confidence: confidencePct,
      border: round1(trueBorder),
      borderDiff,
      goodMachineScore: round1(pe?.valid ? pe.score : evidence.goodMachineScore),
      score: 0,
      evPerHour,
      goalEligible,
      goalThresholdActive: Boolean(planHandoff),
      verdict,
      isStar: verdict === "strong" && (pe?.valid ? pe.score : evidence.goodMachineScore) >= 50,
      isPlaying,
      liveDecision: isPlaying ? liveDecision : null,
      history: history.length > 1
        ? history
        : [history[0] ?? round1(evidence.predictedRotation), history[0] ?? round1(evidence.predictedRotation)],
      evidence,
      pevidence: pe || null,
      ema: round1(pe?.ema || 0),
      cusumUp: round1(pe?.cusumUp || 0),
      cusumDown: round1(pe?.cusumDown || 0),
      nailAlert: pe?.nailAlert || "データ収集中",
      regimeStart: pe?.regimeStart || "",
      tomorrowTight: Math.round((pe?.tightProbability || 0) * 100),
      weekdayTight: Math.round((pe?.weekdayTightRate || 0) * 100),
      weekdaySamples: pe?.weekdaySampleCount || 0,
      winRate: pe?.winRate == null ? null : Math.round(pe.winRate * 100),
      profitChanceLow: scenarioChanceBand?.low ?? pe?.winRateBandLow ?? null,
      profitChanceHigh: scenarioChanceBand?.high ?? pe?.winRateBandHigh ?? null,
      profitChanceStatus: pe?.profitChanceStatus || "data-missing",
      profitChanceMethod: pe?.profitChanceMethod || null,
      jackpotLabel: pe?.jackpotLabel || machineSpec.prob || null,
      jackpotDenominator: pe?.jackpotDenominator ?? (Number(machineSpec.synthProb) > 0 ? Number(machineSpec.synthProb) : null),
      atLeastOneHitRate: pe?.atLeastOneHitRate ?? null,
      initialAvgPayout: pe?.initialAvgPayout ?? null,
      rushAvgPayout: pe?.rushAvgPayout ?? null,
      avgPayoutPerHit: pe?.avgPayoutPerHit ?? (Number(machineSpec.avgPayoutPerHit) > 0 ? Math.round(Number(machineSpec.avgPayoutPerHit)) : null),
      rushEntryRate: pe?.rushEntryRate ?? null,
      rushContinueRate: pe?.rushContinueRate ?? null,
      plannedSpins: pe?.plannedSpins ?? plan?.sessionSpins ?? null,
      modelName: machineSpec.modelName || null,
      unitPrice: pe?.unitPrice || 0,
      unitPriceAvailable: Boolean(pe?.valid),
      daily: pe?.daily || 0,
      hourlyLow: scenarioHourlyLow ?? pe?.hourlyLow ?? null,
      hourlyHigh: scenarioHourlyHigh ?? pe?.hourlyHigh ?? null,
      dailyLow: scenarioDailyLow ?? pe?.dailyLow ?? null,
      dailyHigh: scenarioDailyHigh ?? pe?.dailyHigh ?? null,
      hourlyRisk: pe?.hourlyRisk ?? null,
      dailyRisk: pe?.dailyRisk ?? null,
      sharpe: round1(pe?.sharpe || 0),
      spatialAlert: pe?.spatial?.label || "隣接情報なし",
      oppositeAlert: pe?.opposite?.label || "対面情報なし",
      nextPrediction: analytics.nextMap.find((item) =>
        String(item.number) === String(row.num) &&
        item.machineName === machineName &&
        String(item.store ?? "") === rowStore
      )?.prediction || "データ収集中",
      planRole: planEligible ? planTarget.role : null,
      planPriority: planEligible ? planTarget.priority : null,
      planEvaluation: !planTarget
        ? null
        : !hasPlanEvidence
          ? "insufficient-data"
          : evPerHour < minPlanEv
            ? "below-minimum-ev"
            : "eligible",
    };
    machine.score = scoreOf(machine);
    if (!islandMap.has(islandId)) islandMap.set(islandId, { id: islandId, name: islandName, machines: [] });
    islandMap.get(islandId).machines.push(machine);
  }

  const analyzedIslands = [...islandMap.values()].map((island) => summarizeIsland({
    ...island,
    machines: island.machines.sort((a, b) => Number(a.num) - Number(b.num)),
    start: Math.min(...island.machines.map((machine) => Number(machine.num) || 0)),
  }));
  const islands = applyHallLayout(analyzedIslands, hallIslands);
  const all = islands.flatMap((island) => island.machines);
  if (!all.length) return emptyMap(playingNum, planHandoff, plan);
  const candidates = all
    .filter((machine) => machine.verdict === "strong")
    .sort(compareStrategyPriority);
  const top5 = [...all]
    .filter((machine) => machine.verdict !== "nodata")
    .sort(compareStrategyPriority)
    .slice(0, 5)
    .map((machine, index) => ({ ...machine, rank: index + 1 }));
  const lead = top5[0] || [...all].sort((a, b) => b.confidence - a.confidence)[0];
  const machineNames = [...new Set(all.map((machine) => machine.machineName))];
  const matchedPlanTargets = new Set(all.filter((machine) => machine.planRole).map((machine) => machine.planPriority));
  const islandAvgRot = (id) => {
    const list = all.filter((machine) => machine.islandId === id && machine.rot > 0);
    return list.length ? round1(list.reduce((sum, machine) => sum + machine.rot, 0) / list.length) : 0;
  };

  return {
    source: "delta",
    machineName: machineNames.length === 1 ? machineNames[0] : `${machineNames.length}機種`,
    total: all.length,
    border: lead?.border || 0,
    islands,
    all,
    candidates,
    top5,
    kpi: {
      evPerHour: lead?.evPerHour || 0,
      rot: lead?.rot || 0,
      confidence: lead?.confidence || 0,
      candidates: candidates.length,
    },
    leadId: lead?.id || null,
    islandAvgRot,
    analytics,
    portfolio: analytics.portfolio,
    aiProfile: analytics.aiProfile,
    nextMap: analytics.nextMap,
    islandStats: analytics.islandStats,
    planHandoff,
    plan,
    planMatch: {
      matched: matchedPlanTargets.size,
      total: planHandoff?.targets?.length || 0,
    },
  };
}
