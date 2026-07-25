// 保存済み差玉解析（pt_deltaScans）から戦略マップ表示データを作る純粋関数。
// 仮データ・乱数は使わない。Google Sheets への通信も行わない。

import { machineDB } from "../../machineDB.js";
import {
  buildDeltaEvidence,
  collectDeltaRows,
  findMachineSpec,
  normalizeEvidenceMachineName,
  normalizeEvidenceMachineNumber,
} from "../delta/deltaEvidence.js";
import {
  buildPortfolioPlan,
  buildPEvidenceAnalytics,
  classifyEvidenceScore,
  normalCdf,
  outwardPercentBand,
  priorityScoreOf,
  rankStrategyCandidates,
} from "../evidence/pevidenceAnalytics.js";
import { getStoreIslands } from "../select/hallMapSelectors.js";
import { calculateStrategyEconomics } from "../../economics.js";
import { evidenceDayNumber, normalizeEvidenceDate } from "../../evidenceDate.js";
import { projectCashLimit } from "../../sessionProjection.js";

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function normalizedDate(value) {
  return normalizeEvidenceDate(value);
}

function dayNumber(value) {
  return evidenceDayNumber(value);
}

export function getStrategyFreshness(scans = [], targetDate = "") {
  const latest = [...scans].filter((scan) => normalizedDate(scan?.date)).sort((a, b) =>
    normalizedDate(b?.date).localeCompare(normalizedDate(a?.date)) ||
    String(b?.createdAt || "").localeCompare(String(a?.createdAt || ""))
  )[0] || null;
  const sourceDate = normalizedDate(latest?.date);
  const target = normalizedDate(targetDate) || sourceDate;
  const sourceDay = dayNumber(sourceDate);
  const targetDay = dayNumber(target);
  const ageDays = Number.isFinite(sourceDay) && Number.isFinite(targetDay) ? targetDay - sourceDay : null;
  const status = ageDays === 0
    ? "fresh"
    : ageDays === 1
      ? "prepared"
      : ageDays > 1
        ? "stale"
        : ageDays < 0 ? "future" : "invalid";
  return {
    status,
    sourceDate,
    sourceCreatedAt: latest?.createdAt || "",
    targetDate: target,
    ageDays,
    label: status === "fresh"
      ? "本日解析"
      : status === "prepared" ? `前日解析（${sourceDate}）・本日用`
      : status === "stale" ? `${sourceDate}の解析・${ageDays}日前`
        : status === "future" ? "未来日の解析" : "解析日不明",
  };
}

function recordMatchesStore(record, storeId, storeName) {
  if (storeId != null && record?.storeId != null) return String(record.storeId) === String(storeId);
  return Boolean(storeName) && String(record?.storeName || "").trim() === String(storeName).trim();
}

function hasUsableStrategyRow(row) {
  if (row?.val === null || row?.val === undefined || row?.val === "") return false;
  if (!Number.isFinite(Number(row.val))) return false;
  const status = String(row?.status ?? row?.statusStr ?? row?.qualityStatus ?? "").trim();
  if (status === "review" && row?.reviewConfirmed === true) return true;
  return !status || ["正常", "ok", "OK", "有効"].includes(status);
}
function practiceObservation(record, identity, source) {
  if (!record || !recordMatchesStore(record, identity.storeId, identity.storeName)) return null;
  if (normalizeEvidenceMachineName(record.machineName) !== normalizeEvidenceMachineName(identity.machineName)) return null;
  if (normalizeEvidenceMachineNumber(record.machineNum ?? record.num) !== normalizeEvidenceMachineNumber(identity.num)) return null;
  const stats = record.stats || record.ev || {};
  const ratePerMoneyK = Number(stats.start1K ?? stats.physicalStart1K);
  if (!(ratePerMoneyK > 0)) return null;
  const ballsPerMoneyK = Math.max(1, Number(record.settings?.rentBalls ?? record.rentBalls) || 250);
  let kCount = Math.max(0,
    Number(stats.cashKCount || 0) + Number(stats.mochiKCount || 0) + Number(stats.chodamaKCount || 0)
  );
  if (!(kCount > 0) && Number(stats.netRot) > 0) kCount = Number(stats.netRot) / ratePerMoneyK;
  if (!(kCount > 0)) return null;
  return {
    source,
    date: normalizedDate(record.date),
    rate: ratePerMoneyK * 250 / ballsPerMoneyK,
    inputBalls: kCount * ballsPerMoneyK,
  };
}

function fusePracticeEstimate(base, observations, priorBalls = 50000) {
  const valid = observations.filter((item) => item?.rate > 0 && item?.inputBalls > 0);
  if (!valid.length) return { ...base, sources: ["delta"] };
  const inputBalls = valid.reduce((sum, item) => sum + item.inputBalls, 0);
  const observedRate = valid.reduce((sum, item) => sum + item.rate * item.inputBalls, 0) / inputBalls;
  const observationWeight = inputBalls / (inputBalls + Math.max(2500, Number(priorBalls) || 50000));
  const mean = observedRate * observationWeight + base.mean * (1 - observationWeight);
  const observationSe = 2 / Math.sqrt(Math.max(1, inputBalls / 250));
  const variance = (observationWeight * observationSe) ** 2
    + ((1 - observationWeight) ** 2) * Math.max(0.01, base.variance);
  const sd = Math.sqrt(variance);
  return {
    mean,
    low: Math.max(0, mean - 1.96 * sd),
    high: mean + 1.96 * sd,
    variance,
    confidence: 1 - (1 - base.confidence) * (1 - observationWeight),
    inputBalls: (base.inputBalls || 0) + inputBalls,
    sources: ["delta", ...new Set(valid.map((item) => item.source))],
  };
}

function scoreOf(machine) {
  return Number(machine.goodMachineScore || 0);
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

export function revenueLowerBoundPendingReason({
  lowRotation,
  predictedRotation,
  border,
  variance,
  confidence,
  rawDailyLow,
  cashLimit = 0,
} = {}) {
  const low = Number(lowRotation);
  const mean = Number(predictedRotation);
  const trueBorder = Number(border);
  const posteriorVariance = Number(variance);
  const confidenceValue = Number(confidence);
  if (
    !Number.isFinite(low)
    || !Number.isFinite(mean)
    || !Number.isFinite(trueBorder)
    || !Number.isFinite(posteriorVariance)
    || posteriorVariance < 0
  ) return "invalid-estimate";
  if (!(low > 0)) return "non-positive";
  if (!Number.isFinite(confidenceValue) || confidenceValue < 0.2) return "low-confidence";
  if (
    mean > 0
    && trueBorder > 0
    && low / mean <= 0.5
    && low / trueBorder <= 0.5
  ) return "unstable";
  const budget = Math.max(0, Number(cashLimit) || 0);
  if (budget > 0 && Number.isFinite(Number(rawDailyLow)) && Number(rawDailyLow) < -budget) {
    return "over-budget";
  }
  return null;
}
export function buildStrategyPlanContext({
  date = "",
  dailyResearchPlans = {},
  monthlyPlayPlans = {},
  spinsPerHour = 210,
  defaultHours = 6,
  defaultCashLimit = 0,
  ballValueYen = null,
  rentBalls = 250,
  exRate = 250,
  nonCashRatio = 0,
  nonCashRatioSource = "cash-only",
  nonCashSampleK = 0,
} = {}) {
  const dateKey = String(date || "");
  const daily = dailyResearchPlans?.[dateKey] || null;
  const monthly = monthlyPlayPlans?.[dateKey.slice(0, 7)] || null;
  const styleId = daily?.style || monthly?.baseStyle || "balanced";
  const isSkip = styleId === "skip";
  const plannedHours = isSkip ? 0 : positive(daily?.standardHours ?? monthly?.standardHours, positive(defaultHours, 6));
  const hourlySpins = positive(spinsPerHour, 210);
  const cashLimit = Math.max(0, Number(daily?.cashLimit ?? monthly?.cashLimit ?? defaultCashLimit) || 0);
  const resolvedRentBalls = positive(rentBalls, 250);
  const resolvedExRate = positive(exRate, resolvedRentBalls);
  const resolvedNonCashRatio = Math.min(1, Math.max(0, Number(nonCashRatio) || 0));
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
    rentBalls: resolvedRentBalls,
    exRate: resolvedExRate,
    ballValueYen: positive(ballValueYen, 1000 / resolvedExRate),
    nonCashRatio: resolvedNonCashRatio,
    nonCashRatioSource,
    nonCashSampleK: Math.max(0, Number(nonCashSampleK) || 0),
  };
}

function emptyMap(playingNum, planHandoff = null, plan = null, freshness = null) {
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
    freshness,
    actionable: false,
    sourceSummary: [],
  };
}

function latestScanGroup(scans, selectedStoreId = null, stores = []) {
  const selectedStore = (stores || []).find((store) => String(store?.id) === String(selectedStoreId)) || null;
  const valid = (scans || []).filter((scan) => (
    Boolean(normalizedDate(scan?.date))
    &&
    Array.isArray(scan?.rows)
    && scan.rows.length
    && (
      selectedStoreId == null
      || String(scan?.storeId ?? "") === String(selectedStoreId)
      || (scan?.storeId == null && selectedStore && String(scan?.storeName || "").trim() === String(selectedStore.name || "").trim())
    )
  ));
  if (!valid.length) return [];
  const latest = [...valid].sort((a, b) =>
    normalizedDate(b.date).localeCompare(normalizedDate(a.date)) ||
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  )[0];
  return valid.filter((scan) => (
    normalizedDate(scan.date) === normalizedDate(latest.date)
    && (
      selectedStoreId != null
      || String(scan?.storeId ?? scan?.storeName ?? "") === String(latest?.storeId ?? latest?.storeName ?? "")
    )
  ));
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
  return goalGap
    || aPriority - bPriority
    || Number(b.priorityScore || 0) - Number(a.priorityScore || 0)
    || b.score - a.score
    || b.confidence - a.confidence
    || b.evPerHour - a.evPerHour;
}

function historyFor(scans, machineName, num, machine) {
  const byDate = new Map();
  for (const row of collectDeltaRows(scans, { machineName, num })) {
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row);
  }
  const points = [...byDate.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .slice(-7)
    .map(([, rows]) => buildDeltaEvidence(rows, machine))
    .filter((evidence) => evidence.hasEstimate === true)
    .map((evidence) => round1(evidence.predictedRotation));
  return { points, dayCount: points.length };
}

function buildDataCoverage({
  analyticsHistoryRows = [],
  pe = null,
  evidence = null,
  rowStore = "",
  machineName = "",
  num = "",
  practiceObservations = [],
  inputBalls = 0,
  usesRecentRegime = false,
} = {}) {
  const baseNumber = String(num).replace(/_旧.*/, "").trim();
  const peRows = (analyticsHistoryRows || []).filter((item) =>
    item?.valid
    && String(item.store ?? "").trim() === String(rowStore).trim()
    && String(item.machineName ?? "").trim() === String(machineName).trim()
    && String(item.num ?? "").replace(/_旧.*/, "").trim() === baseNumber
  );
  const activePeRows = usesRecentRegime && pe?.regimeStart
    ? peRows.filter((item) => normalizedDate(item.date) >= normalizedDate(pe.regimeStart))
    : peRows;
  const evidenceRows = (evidence?.observations || []).map((item) => item?.row || item).filter(Boolean);
  const baseRows = pe?.valid && activePeRows.length ? activePeRows : evidenceRows;
  const dates = [...new Set(
    [...baseRows, ...(practiceObservations || [])]
      .map((item) => normalizedDate(item?.date))
      .filter(Boolean)
  )].sort();
  return {
    effectiveDays: dates.length,
    fromDate: dates[0] || "",
    toDate: dates.at(-1) || "",
    inputBalls: Math.max(0, Math.round(Number(inputBalls) || 0)),
    recentRegimeOnly: Boolean(usesRecentRegime),
  };
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
  const eligible = list.filter((machine) =>
    machine.recommendationStatus === "actionable"
    && machine.verdict !== "nodata"
  );
  const strong = eligible.filter((machine) => machine.verdict === "strong");
  const goodRate = eligible.length ? strong.length / eligible.length : 0;
  const best = [...strong].sort((a, b) => b.score - a.score)[0] || null;
  return {
    ...island,
    grade: eligible.length ? islandGrade(goodRate) : "—",
    goodRate: eligible.length ? Math.round(goodRate * 100) : null,
    candidates: strong.length,
    evDensity: strong.length
      ? Math.round(strong.reduce((sum, machine) => sum + machine.evPerHour, 0) / strong.length)
      : 0,
    strongZone: best ? `${best.num}番周辺` : "—",
    analyzedMachines: eligible.length,
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
      facingIslandId: layout.facingIslandId || null,
      facingReversed: layout.facingReversed !== false,
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
  targetDate = "",
  stores = [],
  archives = [],
  liveSession = null,
} = {}) {
  const strategyPlan = plan || buildStrategyPlanContext({
    date: targetDate,
    defaultHours: 6,
    spinsPerHour: 210,
  });
  const currentScans = latestScanGroup(scans, selectedStoreId, stores);
  const freshness = getStrategyFreshness(currentScans, targetDate);
  if (!currentScans.length) return emptyMap(playingNum, planHandoff, strategyPlan, freshness);
  // 差玉リサーチは通常、実戦日の前日に行う。
  // 当日解析に加えて1日前の解析だけを本日用として有効にし、2日以上前は参考表示へ戻す。
  const actionable = freshness.status === "fresh" || freshness.status === "prepared";
  const predictionDayLabel = freshness.status === "prepared" ? "本日" : "明日";

  const analysisStoreId = currentScans[0]?.storeId ?? selectedStoreId;
  const selectedStore = (stores || []).find((store) => String(store?.id) === String(analysisStoreId)) || null;
  const analysisStoreName = currentScans[0]?.storeName || selectedStore?.name || "";
  const hallIslands = getStoreIslands(hallMaps, analysisStoreId);
  // ポートフォリオ・翌日予測に他店舗の台が混ざらないよう、
  // 解析対象は表示中の店舗（最新スキャンの店舗）の履歴に限定する。
  const analysisStoreKey = String(currentScans[0]?.storeId ?? currentScans[0]?.storeName ?? "");
  const storeScans = (scans || []).filter((scan) => {
    if (String(scan?.storeId ?? scan?.storeName ?? "") === analysisStoreKey) return true;
    return scan?.storeId == null
      && Boolean(analysisStoreName)
      && String(scan?.storeName || "").trim() === String(analysisStoreName).trim();
  });
  const analytics = buildPEvidenceAnalytics({
    scans: storeScans,
    customMachines,
    islands: hallIslands,
    params: {
      spinsPerHour: strategyPlan.spinsPerHour,
      sessionSpins: strategyPlan.sessionSpins,
      portfolioHours: strategyPlan.plannedHours,
      cashLimit: strategyPlan.cashLimit,
      rentBalls: strategyPlan.rentBalls,
      exRate: strategyPlan.exRate,
      nonCashRatio: strategyPlan.nonCashRatio,
      ballValueYen: strategyPlan.ballValueYen,
    },
  });
  const analyticsByMachine = new Map((analytics.statusRows || analytics.latestRows).map((item) => [
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
      createdAt: scan.createdAt || "",
      sourceScanDate: normalizedDate(scan.date),
    }))
  );
  const uniqueRows = new Map();
  for (const row of currentRows) {
    const key = `${normalizeEvidenceMachineName(row.machineName)}:${normalizeEvidenceMachineNumber(row.num)}`;
    const previous = uniqueRows.get(key);
    if (!previous || String(row.createdAt || "") >= String(previous.createdAt || "")) uniqueRows.set(key, row);
  }

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
    const equivalentBorder = pe?.valid
      ? Number(pe.equivalentBorder ?? pe.border)
      : Number(evidence.trueBorder);
    const baseMean = pe?.valid ? pe.predictedRotation : evidence.predictedRotation;
    const baseLow = pe?.valid ? pe.predictedLow : evidence.predictedLow;
    const baseHigh = pe?.valid ? pe.predictedHigh : evidence.predictedHigh;
    const baseVariance = pe?.posteriorVariance
      ?? (((Number(baseHigh) - Number(baseLow)) / (2 * 1.96)) ** 2 || 4);
    const identity = {
      storeId: row.storeId ?? analysisStoreId,
      storeName: row.storeName || analysisStoreName,
      machineName,
      num: row.num,
    };
    const observationThroughDate = freshness.targetDate || freshness.sourceDate;
    const newerArchives = (archives || [])
      .filter((archive) => {
        const archiveDate = normalizedDate(archive?.date);
        return Boolean(archiveDate)
          && archiveDate > freshness.sourceDate
          && archiveDate <= observationThroughDate;
      })
      .map((archive) => practiceObservation(archive, identity, "archive"))
      .filter(Boolean);
    const liveDate = normalizedDate(liveSession?.date);
    const liveObservation = liveDate
      && liveDate >= freshness.sourceDate
      && liveDate <= observationThroughDate
      ? practiceObservation(liveSession, identity, "live")
      : null;
    const practiceObservations = [...newerArchives, liveObservation].filter(Boolean);
    const usesRecentRegime = Boolean(
      pe?.valid
      && Number(pe.regimeInputBalls) / 250 >= 4
      && Number(pe.regimeRate) > 0
      && pe.regimeStart
      && pe.regimeDirection
    );
    const baseInputBalls = pe?.valid
      ? (usesRecentRegime ? Number(pe.regimeInputBalls) : Number(pe.cumulativeInputBalls))
      : Number(evidence.totalInputBalls);
    const estimate = fusePracticeEstimate({
      mean: baseMean,
      low: baseLow,
      high: baseHigh,
      variance: baseVariance,
      confidence: pe?.valid ? pe.confidence : evidence.confidence,
      inputBalls: baseInputBalls || 0,
    }, practiceObservations, machineSpec.muraCoef);
    const dataCoverage = buildDataCoverage({
      analyticsHistoryRows: analytics.historyRows,
      pe,
      evidence,
      rowStore,
      machineName,
      num: row.num,
      practiceObservations,
      inputBalls: estimate.inputBalls,
      usesRecentRegime,
    });
    const predictedRotation = estimate.mean;
    const confidence = estimate.confidence;
    const confidencePct = Math.round(confidence * 100);
    const economicOptions = {
      equivalentBorder,
      rentBalls: strategyPlan.rentBalls,
      exRate: strategyPlan.exRate,
      nonCashRatio: strategyPlan.nonCashRatio,
    };
    const centerEconomics = calculateStrategyEconomics({ ...economicOptions, rotation: predictedRotation });
    const trueBorder = centerEconomics.effectiveBorder;
    const currentRowDate = normalizedDate(row.date || row.sourceScanDate);
    const currentRowInvalid = !hasUsableStrategyRow(row)
      || !currentRowDate
      || currentRowDate !== row.sourceScanDate
      || Boolean(pe && !pe.valid);
    const machineActionable = actionable && !currentRowInvalid;
    const borderDiff = currentRowInvalid ? null : round1(predictedRotation - trueBorder);
    const contextualScore = currentRowInvalid
      ? 0
      : Math.max(0, borderDiff * confidence * 100 + Number(pe?.contextAdjustment || 0));
    const verdict = currentRowInvalid ? "nodata" : classifyEvidenceScore(contextualScore, confidence);
    const islandName = row.island || `${machineName}島`;
    const islandId = islandName;
    // スパークラインも表示中店舗の履歴だけを使う（他店舗の同番号を混ぜない）
    const historySummary = historyFor(storeScans, machineName, row.num, machineSpec);
    const isPlaying = playingNum != null && String(row.num) === String(playingNum);
    const liveStats = liveSession?.stats || liveSession?.ev || {};
    const currentCashInvest = isPlaying
      ? Math.max(0, Number(liveStats.rawInvest) || Number(liveStats.cashKCount) * 1000 || 0)
      : 0;
    const cashLimitGuide = projectCashLimit({
      cashLimit: strategyPlan.cashLimit,
      rawInvest: currentCashInvest,
      rotationPer250: machineActionable ? predictedRotation : 0,
      rentBalls: strategyPlan.rentBalls,
      spinsPerHour: strategyPlan.spinsPerHour,
      playMode: isPlaying ? (liveSession?.playMode || "cash") : "cash",
    });
    // 中心・上下幅・金額・確率を同じ事後推定から計算し、レジーム切替後に
    // 旧状態の履歴が収支幅へ戻ってくる不整合を防ぐ。
    const scenarioLowRotation = estimate.low;
    const scenarioHighRotation = estimate.high;
    const lowEconomics = calculateStrategyEconomics({ ...economicOptions, rotation: scenarioLowRotation });
    const highEconomics = calculateStrategyEconomics({ ...economicOptions, rotation: scenarioHighRotation });
    const unitPrice = predictedRotation > 0 && trueBorder > 0 ? centerEconomics.evPerRot : null;
    const lowUnitPrice = scenarioLowRotation > 0 && trueBorder > 0 ? lowEconomics.evPerRot : null;
    const highUnitPrice = scenarioHighRotation > 0 && trueBorder > 0 ? highEconomics.evPerRot : null;
    const scenarioHourly = machineActionable && unitPrice != null ? Math.round(unitPrice * analytics.params.spinsPerHour) : null;
    const rawScenarioHourlyLow = machineActionable && lowUnitPrice != null ? Math.round(lowUnitPrice * analytics.params.spinsPerHour) : null;
    const scenarioHourlyHigh = machineActionable && highUnitPrice != null ? Math.round(highUnitPrice * analytics.params.spinsPerHour) : null;
    const scenarioDaily = machineActionable && unitPrice != null ? Math.round(unitPrice * analytics.params.sessionSpins) : null;
    const rawScenarioDailyLow = machineActionable && lowUnitPrice != null ? Math.round(lowUnitPrice * analytics.params.sessionSpins) : null;
    const scenarioDailyHigh = machineActionable && highUnitPrice != null ? Math.round(highUnitPrice * analytics.params.sessionSpins) : null;
    const hasLowRotation = scenarioLowRotation != null && Number.isFinite(Number(scenarioLowRotation));
    const hasHighRotation = scenarioHighRotation != null && Number.isFinite(Number(scenarioHighRotation));
    const lowerBoundPendingReason = hasLowRotation && hasHighRotation
      ? revenueLowerBoundPendingReason({
          lowRotation: scenarioLowRotation,
          predictedRotation,
          border: trueBorder,
          variance: estimate.variance,
          confidence,
          rawDailyLow: rawScenarioDailyLow,
          cashLimit: strategyPlan.cashLimit,
        })
      : null;
    const revenueRangeStatus = !actionable
      ? "stale-scan"
      : currentRowInvalid
        ? "data-missing"
      : !hasLowRotation || !hasHighRotation
        ? "range-missing"
        : lowerBoundPendingReason
          ? "lower-bound-missing"
          : "ready";
    const scenarioHourlyLow = revenueRangeStatus === "ready" ? rawScenarioHourlyLow : null;
    const scenarioDailyLow = revenueRangeStatus === "ready" ? rawScenarioDailyLow : null;
    const baseProfitChanceReady = machineActionable
      && (pe?.profitChanceStatus === "ready" || (pe?.profitChanceStatus === "low-confidence" && confidence >= 0.2));
    const profitChanceReady = baseProfitChanceReady && revenueRangeStatus === "ready";
    const scenarioChanceBand = profitChanceReady && pe?.dailyRisk > 0 && scenarioDailyLow != null && scenarioDailyHigh != null
      ? outwardPercentBand(normalCdf(scenarioDailyLow / pe.dailyRisk), normalCdf(scenarioDailyHigh / pe.dailyRisk))
      : null;
    const scenarioWinRate = profitChanceReady && pe?.dailyRisk > 0 && scenarioDaily != null
      ? normalCdf(scenarioDaily / pe.dailyRisk)
      : null;
    const planTarget = planTargetForMachine(machineName, planHandoff, machineSpec);
    const evPerHour = scenarioHourly;
    const minPlanEv = Math.max(0, Number(planHandoff?.minExpectedValuePerHour) || 0);
    const hasPlanEvidence = machineActionable && verdict !== "nodata" && evPerHour != null;
    const goalEligible = planHandoff ? Boolean(hasPlanEvidence && evPerHour >= minPlanEv) : machineActionable;
    const planEligible = Boolean(planTarget && goalEligible);
    const machine = {
      id: `m-${machineName}-${row.num}`,
      num: Number(row.num) || row.num,
      islandId,
      machineName,
      rot: currentRowInvalid ? null : round1(predictedRotation),
      confidence: currentRowInvalid ? 0 : confidencePct,
      border: round1(trueBorder),
      equivalentBorder: round1(equivalentBorder),
      borderDiff,
      goodMachineScore: round1(contextualScore),
      score: 0,
      evPerHour,
      goalEligible,
      goalThresholdActive: Boolean(planHandoff),
      verdict,
      isStar: machineActionable && verdict === "strong" && contextualScore >= 50,
      isPlaying,
      liveDecision: isPlaying ? liveDecision : null,
      history: historySummary.points.length > 1
        ? historySummary.points
        : [
            historySummary.points[0] ?? round1(evidence.predictedRotation),
            historySummary.points[0] ?? round1(evidence.predictedRotation),
          ],
      historyDayCount: historySummary.dayCount,
      dataCoverage,
      activityStatus: currentRowInvalid ? "invalid" : (pe?.activityStatus || (pe?.valid ? "active" : "invalid")),
      evidence,
      pevidence: pe || null,
      rotationEstimate: {
        mean: currentRowInvalid ? null : round1(estimate.mean),
        low: currentRowInvalid ? null : round1(estimate.low),
        high: currentRowInvalid ? null : round1(estimate.high),
        variance: currentRowInvalid ? null : estimate.variance,
        confidence: currentRowInvalid ? 0 : confidence,
        inputBalls: currentRowInvalid ? 0 : estimate.inputBalls,
        regimeStart: pe?.regimeStart || "",
      },
      evidenceSources: currentRowInvalid ? [] : estimate.sources,
      recommendationStatus: machineActionable ? "actionable" : "reference",
      calculationPendingReasons: machineActionable
        ? []
        : [currentRowInvalid ? (pe?.exclusionReason || "最新データを計算から除外しました") : "解析日が本日または前日ではありません"],
      predictionDayLabel,
      ema: currentRowInvalid ? 0 : round1(pe?.ema || 0),
      cusumUp: currentRowInvalid ? 0 : round1(pe?.cusumUp || 0),
      cusumDown: currentRowInvalid ? 0 : round1(pe?.cusumDown || 0),
      nailAlert: currentRowInvalid ? "データ除外" : (pe?.nailAlert || "データ収集中"),
      regimeStart: currentRowInvalid ? "" : (pe?.regimeStart || ""),
      tomorrowTight: machineActionable
        && pe?.valid
        && pe?.tightProbability != null
        && pe.tightProbability !== ""
        && Number.isFinite(Number(pe.tightProbability))
        ? Math.round(Number(pe.tightProbability) * 100)
        : null,
      tightEvidence: currentRowInvalid
        ? {
            status: "unavailable",
            label: pe?.exclusionReason || "有効データ不足のため算定待ち",
            successes: 0,
            total: 0,
            minRequired: analytics.params.markovMinTransitions,
          }
        : pe?.tightEvidence || {
            status: "unavailable",
            label: "算定待ち",
            successes: 0,
            total: 0,
            minRequired: analytics.params.markovMinTransitions,
          },
      weekdayTight: !currentRowInvalid
        && pe?.weekdayTightRate != null
        && pe.weekdayTightRate !== ""
        && Number.isFinite(Number(pe.weekdayTightRate))
        ? Math.round(Number(pe.weekdayTightRate) * 100)
        : null,
      weekdaySamples: currentRowInvalid ? 0 : (pe?.weekdaySampleCount || 0),
      winRate: scenarioWinRate == null ? null : Math.round(scenarioWinRate * 100),
      profitChanceLow: scenarioChanceBand?.low ?? null,
      profitChanceHigh: scenarioChanceBand?.high ?? null,
      profitChanceStatus: !actionable
        ? "stale-scan"
        : currentRowInvalid
          ? (pe?.profitChanceStatus || "data-missing")
          : profitChanceReady
            ? "ready"
            : revenueRangeStatus === "lower-bound-missing"
              ? lowerBoundPendingReason === "over-budget"
                ? "plan-limit-exceeded"
                : lowerBoundPendingReason === "low-confidence"
                  ? "low-confidence"
                  : "rotation-range-too-wide"
              : revenueRangeStatus === "range-missing"
                ? "rotation-range-missing"
                : (pe?.profitChanceStatus || "data-missing"),
      profitChanceMethod: profitChanceReady ? "normal-approx-v1" : null,
      jackpotLabel: pe?.jackpotLabel || machineSpec.prob || null,
      jackpotDenominator: pe?.jackpotDenominator ?? (Number(machineSpec.synthProb) > 0 ? Number(machineSpec.synthProb) : null),
      atLeastOneHitRate: machineActionable ? (pe?.atLeastOneHitRate ?? null) : null,
      initialAvgPayout: pe?.initialAvgPayout ?? null,
      rushAvgPayout: pe?.rushAvgPayout ?? null,
      avgPayoutPerHit: pe?.avgPayoutPerHit ?? (Number(machineSpec.avgPayoutPerHit) > 0 ? Math.round(Number(machineSpec.avgPayoutPerHit)) : null),
      rushEntryRate: pe?.rushEntryRate ?? null,
      rushContinueRate: pe?.rushContinueRate ?? null,
      plannedSpins: pe?.plannedSpins ?? strategyPlan.sessionSpins,
      modelName: machineSpec.modelName || null,
      stdDev: Number(machineSpec.stdDev) > 0 ? Number(machineSpec.stdDev) : null,
      stdDevVerified: machineSpec.stdDevMethod === "p-evidence-branching-v2",
      unitPrice: unitPrice,
      unitPriceAvailable: machineActionable && unitPrice != null,
      economicAssumptions: {
        rentBalls: strategyPlan.rentBalls,
        exRate: strategyPlan.exRate,
        nonCashRatio: strategyPlan.nonCashRatio,
        cashRatio: 1 - strategyPlan.nonCashRatio,
      },
      daily: scenarioDaily,
      hourlyLow: scenarioHourlyLow,
      hourlyHigh: scenarioHourlyHigh,
      dailyLow: scenarioDailyLow,
      dailyHigh: scenarioDailyHigh,
      revenueRangeStatus,
      revenueRangeReason: lowerBoundPendingReason,
      hourlyRisk: machineActionable ? (pe?.hourlyRisk ?? null) : null,
      dailyRisk: machineActionable ? (pe?.dailyRisk ?? null) : null,
      sharpe: machineActionable && pe?.hourlyRisk > 0 && scenarioHourly != null ? round1(scenarioHourly / pe.hourlyRisk) : null,
      cashLimitGuide,
      spatialAlert: currentRowInvalid ? "データ除外" : (pe?.spatial?.label || "隣接情報なし"),
      oppositeAlert: currentRowInvalid ? "データ除外" : (pe?.opposite?.label || "対面情報なし"),
      nextPrediction: machineActionable ? (analytics.nextMap.find((item) =>
        String(item.number) === String(row.num) &&
        item.machineName === machineName &&
        String(item.store ?? "") === rowStore
      )?.prediction || "データ収集中") : "過去参考・前日または本日の解析待ち",
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
    machine.priorityScore = priorityScoreOf(machine);
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
  if (!all.length) return emptyMap(playingNum, planHandoff, strategyPlan, freshness);
  const candidatePool = all.filter((machine) =>
    machine.recommendationStatus === "actionable"
    && machine.verdict === "strong"
    && !String(machine.nailAlert || "").includes("締め")
  );
  const candidates = actionable
    ? (planHandoff
        ? [...candidatePool].sort(compareStrategyPriority)
        : rankStrategyCandidates(candidatePool))
    : [];
  const topPool = all
    .filter((machine) => machine.verdict !== "nodata")
    .filter((machine) => machine.recommendationStatus === "actionable");
  const top5 = (planHandoff
    ? [...topPool].sort(compareStrategyPriority)
    : rankStrategyCandidates(topPool))
    .slice(0, 5)
    .map((machine, index) => ({ ...machine, rank: index + 1 }));
  const lead = top5[0] || [...all].sort((a, b) => b.confidence - a.confidence)[0];
  const machineNames = [...new Set(all.map((machine) => machine.machineName))];
  const matchedPlanTargets = new Set(all.filter((machine) => machine.planRole).map((machine) => machine.planPriority));
  const portfolio = actionable && !strategyPlan.isSkip
    ? buildPortfolioPlan(all, {
        plannedHours: strategyPlan.plannedHours,
        cashLimit: strategyPlan.cashLimit,
        spinsPerHour: strategyPlan.spinsPerHour,
        rentBalls: strategyPlan.rentBalls,
        nonCashRatio: strategyPlan.nonCashRatio,
        maxCandidates: 5,
      })
    : { plan: [], totalHours: 0, expectedProfit: 0, projectedCash: 0 };
  const islandAvgRot = (id) => {
    const list = all.filter((machine) =>
      machine.islandId === id
      && machine.recommendationStatus === "actionable"
      && machine.verdict !== "nodata"
      && machine.rot > 0
      && Number(machine.rotationEstimate?.inputBalls || 0) > 0
    );
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
      evPerHour: actionable ? lead?.evPerHour ?? null : null,
      rot: lead?.rot || 0,
      confidence: lead?.confidence || 0,
      candidates: candidates.length,
    },
    leadId: lead?.id || null,
    islandAvgRot,
    analytics,
    portfolio,
    aiProfile: analytics.aiProfile,
    nextMap: analytics.nextMap,
    islandStats: analytics.islandStats,
    planHandoff,
    plan: strategyPlan,
    planMatch: {
      matched: matchedPlanTargets.size,
      total: planHandoff?.targets?.length || 0,
    },
    freshness,
    actionable,
    sourceSummary: [...new Set(all.flatMap((machine) => machine.evidenceSources || []))],
  };
}
