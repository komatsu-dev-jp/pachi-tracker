import { archiveWorkMinutes, getActualPL, getChodamaPL, getEvAmount } from "../analysis/analysisSelectors.js";

export const STANDARD_SESSION_SPINS = 2200;
export const CENTRAL_80_Z = 1.2815515655446004;

export const PLAY_STYLES = Object.freeze({
  stable: Object.freeze({
    id: "stable",
    label: "安定リサーチ",
    shortLabel: "安定 70%",
    description: "ブレ小さめの機種を中心に、標準帯も比較します。",
    allocation: Object.freeze({ stable: 70, balanced: 30, high: 0 }),
    candidateTiers: Object.freeze(["stable", "stable", "stable", "balanced", "balanced"]),
  }),
  balanced: Object.freeze({
    id: "balanced",
    label: "バランス",
    shortLabel: "安定 40%",
    description: "安定帯と標準帯を軸に、高変動も少しだけ比較します。",
    allocation: Object.freeze({ stable: 40, balanced: 40, high: 20 }),
    candidateTiers: Object.freeze(["stable", "balanced", "stable", "balanced", "high"]),
  }),
  ev: Object.freeze({
    id: "ev",
    label: "変動許容",
    shortLabel: "高変動 50%",
    description: "荒れやすい機種を広く比較します。期待値条件とは別の設定です。",
    allocation: Object.freeze({ stable: 20, balanced: 30, high: 50 }),
    candidateTiers: Object.freeze(["high", "balanced", "high", "stable", "high"]),
  }),
});

export const MAX_RESEARCH_BACKUPS = 2;

export function buildResearchAllocation(packageId, plannedDates, standardHours) {
  const researchPackage = PLAY_STYLES[packageId] || PLAY_STYLES.balanced;
  const dayCount = Array.isArray(plannedDates) ? plannedDates.length : 0;
  const totalMinutes = Math.max(0, Math.round(dayCount * Math.max(0, Number(standardHours) || 0) * 60));
  const stableMinutes = Math.round(totalMinutes * researchPackage.allocation.stable / 100);
  const balancedMinutes = Math.round(totalMinutes * researchPackage.allocation.balanced / 100);
  return {
    packageId: researchPackage.id,
    dayCount,
    totalMinutes,
    minutesByTier: {
      stable: stableMinutes,
      balanced: balancedMinutes,
      high: Math.max(0, totalMinutes - stableMinutes - balancedMinutes),
    },
  };
}

const finitePositive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const roundUpTo = (value, step = 1) => {
  const safeStep = finitePositive(step) ?? 1;
  return Math.ceil(Math.max(0, Number(value) || 0) / safeStep) * safeStep;
};

const localDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const isValidDateKey = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(value || ""))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

export const DEFAULT_PLANNING_SPINS_PER_HOUR = 210;

export function buildGoalBackcast({
  target = 0,
  currentExpected = 0,
  plannedDates = [],
  archives = [],
  dailyPlans = {},
  standardHours = 6,
  spinsPerHour = DEFAULT_PLANNING_SPINS_PER_HOUR,
  now = new Date(),
} = {}) {
  const safeTarget = Math.max(0, Math.floor(Number(target) || 0));
  const safeCurrentExpected = Math.round(Number(currentExpected) || 0);
  const safeHours = finitePositive(standardHours) ?? 6;
  const safeSpinsPerHour = finitePositive(spinsPerHour) ?? DEFAULT_PLANNING_SPINS_PER_HOUR;
  const todayKey = localDateKey(now);
  const monthKey = todayKey.slice(0, 7);
  const normalizedDates = [...new Set((Array.isArray(plannedDates) ? plannedDates : [])
    .map(String)
    .filter((date) => isValidDateKey(date) && date.startsWith(monthKey)))]
    .sort();
  const activeDates = normalizedDates.filter((date) => dailyPlans?.[date]?.status !== "skip");
  const workedMinutesToday = (Array.isArray(archives) ? archives : [])
    .filter((archive) => String(archive?.date || "") === todayKey)
    .reduce((sum, archive) => sum + archiveWorkMinutes(archive), 0);
  const remainingDates = activeDates
    .filter((date) => date >= todayKey)
    .map((date) => {
      const plannedHours = finitePositive(dailyPlans?.[date]?.standardHours) ?? safeHours;
      const workedHours = date === todayKey ? workedMinutesToday / 60 : 0;
      return {
        date,
        plannedHours,
        workedHours,
        remainingHours: Math.max(0, plannedHours - workedHours),
      };
    });
  const availableDates = remainingDates.filter((row) => row.remainingHours > 0);
  const remainingExpected = Math.max(0, safeTarget - safeCurrentExpected);
  const achieved = safeTarget > 0 && remainingExpected === 0;
  const remainingSessionCount = availableDates.length;
  const remainingHours = availableDates.reduce((sum, row) => sum + row.remainingHours, 0);
  const requiredHourlyEv = achieved
    ? 0
    : remainingHours > 0
      ? roundUpTo(remainingExpected / remainingHours, 100)
      : null;
  const requiredSessionEv = achieved
    ? 0
    : availableDates[0] && requiredHourlyEv != null
      ? Math.min(remainingExpected, roundUpTo(requiredHourlyEv * availableDates[0].remainingHours, 100))
      : null;
  const requiredUnitPrice = requiredHourlyEv == null
    ? null
    : Math.ceil((requiredHourlyEv / safeSpinsPerHour) * 100) / 100;
  const elapsedScheduledCount = activeDates.filter((date) => date < todayKey).length;
  const targetPaceNow = activeDates.length > 0
    ? Math.round((safeTarget * elapsedScheduledCount) / activeDates.length)
    : null;

  return {
    status: safeTarget <= 0
      ? "needs-target"
      : achieved
        ? "achieved"
        : remainingHours > 0
          ? "ready"
          : remainingDates.length > 0
            ? "no-capacity"
            : "needs-schedule",
    target: safeTarget,
    currentExpected: safeCurrentExpected,
    remainingExpected,
    plannedSessionCount: activeDates.length,
    remainingSessionCount,
    remainingHours,
    nextDate: availableDates[0]?.date || "",
    nextRemainingHours: availableDates[0]?.remainingHours || 0,
    isToday: availableDates[0]?.date === todayKey,
    standardHours: safeHours,
    spinsPerHour: safeSpinsPerHour,
    requiredSessionEv,
    requiredHourlyEv,
    requiredUnitPrice,
    targetPaceNow,
    paceGap: targetPaceNow == null ? null : safeCurrentExpected - targetPaceNow,
  };
}

export function getRealPL(archive) {
  const cash = getActualPL(archive);
  const held = getChodamaPL(archive);
  if (cash == null && held === 0) return null;
  return (cash ?? 0) + held;
}

export function buildRiskSnapshot({ machine, ballValueYen, capturedAt = new Date().toISOString() } = {}) {
  const stdDevBalls = finitePositive(machine?.stdDev);
  const yenPerBall = finitePositive(ballValueYen);
  if (stdDevBalls == null || yenPerBall == null || machine?.stdDevMethod !== "p-evidence-branching-v2") return null;
  return {
    machineName: machine.name || "",
    modelName: machine.modelName || "",
    stdDevBalls,
    stdDevMethod: machine.stdDevMethod,
    stdDevLabel: machine.stdDevLabel || "P-EVIDENCE推定",
    referenceSpins: STANDARD_SESSION_SPINS,
    ballValueYen: yenPerBall,
    sourceDate: machine.dataUpdatedAt || machine.modelUpdatedAt || "",
    sourceType: "machine-master",
    sourceUrl: machine.modelSourceUrl || machine.sourceUrls?.[0] || "",
    capturedAt,
  };
}

export function findExactMachine(machines, identity) {
  const target = String(identity || "").trim();
  if (!target) return null;
  return (Array.isArray(machines) ? machines : []).find((machine) => (
    machine?.name === target
    || machine?.modelName === target
    || (Array.isArray(machine?.aliases) && machine.aliases.includes(target))
  )) || null;
}

function interpolatedQuantile(sorted, ratio) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * ratio;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

export function buildVolatilityReference(machines) {
  const values = (Array.isArray(machines) ? machines : [])
    .filter((machine) => machine?.stdDevMethod === "p-evidence-branching-v2")
    .map((machine) => finitePositive(machine?.stdDev))
    .filter((value) => value != null)
    .sort((a, b) => a - b);

  return {
    values,
    sampleSize: values.length,
    p33: interpolatedQuantile(values, 1 / 3),
    p67: interpolatedQuantile(values, 2 / 3),
  };
}

export function classifyMachineVolatility(stdDev, reference) {
  const value = finitePositive(stdDev);
  const values = Array.isArray(reference?.values) ? reference.values : [];
  if (value == null || values.length === 0) {
    return { tier: "unknown", percentile: null, label: "判定保留" };
  }

  let below = 0;
  let equal = 0;
  for (const item of values) {
    if (item < value) below += 1;
    else if (item === value) equal += 1;
  }
  const percentile = (below + equal / 2) / values.length;
  if (percentile <= 1 / 3) return { tier: "stable", percentile, label: "ブレ小さめ" };
  if (percentile <= 2 / 3) return { tier: "balanced", percentile, label: "標準" };
  return { tier: "high", percentile, label: "ブレ大きめ" };
}

export function getResearchCandidateKey(machine, storeId = "any") {
  const name = String(machine?.name || "").trim();
  const modelName = String(machine?.modelName || "").trim();
  return name || modelName ? `${String(storeId || "any")}::${name}::${modelName}` : "";
}

function sortRiskBucket(rows, tier) {
  return [...rows].sort((a, b) => {
    if (tier === "stable") return Number(a.machine.stdDev) - Number(b.machine.stdDev);
    if (tier === "high") return Number(b.machine.stdDev) - Number(a.machine.stdDev);
    const centerGap = Math.abs(Number(a.risk.percentile) - 0.5) - Math.abs(Number(b.risk.percentile) - 0.5);
    if (centerGap !== 0) return centerGap;
    return Number(a.machine.stdDev) - Number(b.machine.stdDev);
  });
}

export function isMachineRiskVerified(machine) {
  return machine?.stdDevMethod === "p-evidence-branching-v2" && finitePositive(machine?.stdDev) != null;
}

function candidateFromRow(row, packageId, storeId, { recommended = true } = {}) {
  const { machine, risk } = row;
  const riskVerified = isMachineRiskVerified(machine) && risk?.tier !== "unknown";
  return {
    key: getResearchCandidateKey(machine, storeId),
    name: machine.name,
    modelName: machine.modelName || "型式確認中",
    aliases: Array.isArray(machine.aliases) ? machine.aliases.filter(Boolean) : [],
    maker: machine.maker || "",
    machineType: machine.type || "",
    stdDev: riskVerified ? Number(machine.stdDev) : null,
    riskVerified,
    riskTier: riskVerified ? risk.tier : "unknown",
    riskLabel: riskVerified ? risk.label : "ブレ未検証",
    reason: recommended
      ? `${PLAY_STYLES[packageId]?.label || PLAY_STYLES.balanced.label}の${risk.label}枠`
      : riskVerified
        ? `${risk.label}の登録機種`
        : "機種マスター登録済み",
    recommended,
    installationStatus: "unverified",
    unitPriceStatus: "store-data-required",
    sourceDate: machine.dataUpdatedAt || machine.modelUpdatedAt || "",
    sourceUrl: machine.modelSourceUrl || machine.sourceUrls?.[0] || null,
  };
}

export function normalizeMachineSearch(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/[\s‐‑‒–—―_/・･()（）[\]【】「」『』.．-]+/gu, "");
}

function machineSearchScore(machine, query) {
  if (!query) return 0;
  const values = [
    machine?.name,
    machine?.modelName,
    machine?.maker,
    machine?.type,
    ...(Array.isArray(machine?.aliases) ? machine.aliases : []),
  ]
    .map(normalizeMachineSearch)
    .filter(Boolean);
  if (values.some((value) => value === query)) return 0;
  if (values.some((value) => value.startsWith(query))) return 1;
  if (values.some((value) => value.includes(query))) return 2;
  return null;
}

export function buildMachineCatalogCandidates(machines, {
  storeId = "any",
  query = "",
  riskTier = "all",
} = {}) {
  const list = Array.isArray(machines) ? machines : [];
  const reference = buildVolatilityReference(list);
  const normalizedQuery = normalizeMachineSearch(query);
  const seen = new Set();
  const rows = [];

  for (const machine of list) {
    const key = getResearchCandidateKey(machine, storeId);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const risk = isMachineRiskVerified(machine)
      ? classifyMachineVolatility(machine.stdDev, reference)
      : { tier: "unknown", percentile: null, label: "ブレ未検証" };
    if (riskTier !== "all" && risk.tier !== riskTier) continue;
    const searchScore = machineSearchScore(machine, normalizedQuery);
    if (searchScore == null) continue;
    rows.push({ machine, risk, searchScore });
  }

  return rows
    .sort((a, b) => (
      a.searchScore - b.searchScore
      || String(a.machine.name || a.machine.modelName || "").localeCompare(
        String(b.machine.name || b.machine.modelName || ""),
        "ja",
        { numeric: true, sensitivity: "base" }
      )
    ))
    .map((row) => candidateFromRow(row, "balanced", storeId, { recommended: false }));
}

export function buildPinnedResearchCandidates({
  selectedKeys = [],
  catalogCandidates = [],
  visibleCandidates = [],
} = {}) {
  const catalogByKey = new Map((Array.isArray(catalogCandidates) ? catalogCandidates : [])
    .map((candidate) => [String(candidate?.key || ""), candidate])
    .filter(([key]) => key));
  const visibleKeys = new Set((Array.isArray(visibleCandidates) ? visibleCandidates : [])
    .map((candidate) => String(candidate?.key || ""))
    .filter(Boolean));
  const seen = new Set();

  return (Array.isArray(selectedKeys) ? selectedKeys : [])
    .map(String)
    .filter((key) => key && !seen.has(key) && seen.add(key) && !visibleKeys.has(key))
    .map((key) => catalogByKey.get(key))
    .filter(Boolean);
}

export function buildResearchPackageCandidates(machines, packageId = "balanced", limit = 5, { storeId = "any" } = {}) {
  const list = Array.isArray(machines) ? machines : [];
  const reference = buildVolatilityReference(list);
  const researchPackage = PLAY_STYLES[packageId] || PLAY_STYLES.balanced;
  const rows = list
    .filter(isMachineRiskVerified)
    .map((machine) => ({
      machine,
      risk: classifyMachineVolatility(machine.stdDev, reference),
    }))
    .filter((row) => row.risk.tier !== "unknown" && getResearchCandidateKey(row.machine, storeId));

  const buckets = {
    stable: sortRiskBucket(rows.filter((row) => row.risk.tier === "stable"), "stable"),
    balanced: sortRiskBucket(rows.filter((row) => row.risk.tier === "balanced"), "balanced"),
    high: sortRiskBucket(rows.filter((row) => row.risk.tier === "high"), "high"),
  };
  const selected = [];
  const used = new Set();
  const requestedLimit = Math.max(0, Math.floor(Number(limit) || 0));

  for (let index = 0; index < requestedLimit; index += 1) {
    const tier = researchPackage.candidateTiers[index % researchPackage.candidateTiers.length];
    const next = buckets[tier].find((row) => !used.has(getResearchCandidateKey(row.machine, storeId)));
    if (!next) continue;
    used.add(getResearchCandidateKey(next.machine, storeId));
    selected.push(next);
  }

  if (selected.length < requestedLimit) {
    const fallbackTierOrder = packageId === "stable"
      ? ["stable", "balanced"]
      : packageId === "ev"
        ? ["high", "balanced", "stable"]
        : ["balanced", "stable", "high"];
    for (const tier of fallbackTierOrder) {
      for (const row of buckets[tier]) {
        const key = getResearchCandidateKey(row.machine, storeId);
        if (used.has(key)) continue;
        used.add(key);
        selected.push(row);
        if (selected.length >= requestedLimit) break;
      }
      if (selected.length >= requestedLimit) break;
    }
  }

  return selected.map((row) => candidateFromRow(row, researchPackage.id, storeId));
}

export function buildStyleCandidates(machines, styleId = "balanced", limit = 3) {
  return buildResearchPackageCandidates(machines, styleId, limit);
}

export function buildDailyResearchSelection(
  machines,
  packageId,
  basePlan = null,
  { storeId = null } = {}
) {
  if (packageId === "skip") {
    return {
      status: "skip",
      researchTargets: normalizeResearchTargets(),
      candidates: [],
      inherited: false,
    };
  }

  const normalizedPackageId = PLAY_STYLES[packageId] ? packageId : "balanced";
  const hasValidStore = storeId != null && String(storeId) !== "any";
  const generated = buildResearchPackageCandidates(machines, normalizedPackageId, 5, { storeId: storeId || "any" });
  const basePackageId = basePlan?.researchPackageId || basePlan?.baseStyle || "balanced";
  const baseTargets = normalizeResearchTargets(basePlan?.researchTargets);
  const sameStore = hasValidStore && String(basePlan?.defaultStoreId ?? storeId) === String(storeId);
  const canInherit = normalizedPackageId === basePackageId
    && sameStore
    && basePlan?.status === "research-ready"
    && Boolean(baseTargets.primaryMachineKey);

  const candidatesByKey = new Map();
  if (canInherit && Array.isArray(basePlan?.candidateSnapshot?.candidates)) {
    basePlan.candidateSnapshot.candidates.forEach((candidate) => {
      if (candidate?.key) candidatesByKey.set(candidate.key, candidate);
    });
  }
  generated.forEach((candidate) => candidatesByKey.set(candidate.key, candidate));

  return {
    status: canInherit && hasValidStore ? "research-ready" : "needs-review",
    researchTargets: canInherit ? baseTargets : normalizeResearchTargets(),
    candidates: [...candidatesByKey.values()],
    inherited: canInherit,
  };
}

export function normalizeResearchTargets(targets) {
  const primaryMachineKey = String(targets?.primaryMachineKey || "");
  const backupMachineKeys = [...new Set(Array.isArray(targets?.backupMachineKeys) ? targets.backupMachineKeys.map(String).filter(Boolean) : [])]
    .filter((key) => key !== primaryMachineKey)
    .slice(0, MAX_RESEARCH_BACKUPS);
  const selected = new Set([primaryMachineKey, ...backupMachineKeys].filter(Boolean));
  const excludedMachineKeys = [...new Set(Array.isArray(targets?.excludedMachineKeys) ? targets.excludedMachineKeys.map(String).filter(Boolean) : [])]
    .filter((key) => !selected.has(key));
  return { primaryMachineKey, backupMachineKeys, excludedMachineKeys };
}

export function getResearchTargetRole(targets, candidateKey) {
  const normalized = normalizeResearchTargets(targets);
  if (normalized.primaryMachineKey === candidateKey) return "primary";
  if (normalized.backupMachineKeys.includes(candidateKey)) return "backup";
  if (normalized.excludedMachineKeys.includes(candidateKey)) return "excluded";
  return "candidate";
}

export function updateResearchTargets(targets, candidateKey, role) {
  const key = String(candidateKey || "");
  const current = normalizeResearchTargets(targets);
  if (!key) return current;

  const next = {
    primaryMachineKey: current.primaryMachineKey === key ? "" : current.primaryMachineKey,
    backupMachineKeys: current.backupMachineKeys.filter((item) => item !== key),
    excludedMachineKeys: current.excludedMachineKeys.filter((item) => item !== key),
  };
  const currentRole = getResearchTargetRole(current, key);
  if (currentRole === role) return next;
  if (role === "primary") next.primaryMachineKey = key;
  if (role === "backup" && next.backupMachineKeys.length < MAX_RESEARCH_BACKUPS) next.backupMachineKeys.push(key);
  if (role === "excluded") next.excludedMachineKeys.push(key);
  return normalizeResearchTargets(next);
}

function findMachineForArchive(archive, machines) {
  const targetName = String(archive?.machineName || "").trim().toLowerCase();
  const targetModel = String(archive?.modelName || archive?.settings?.modelName || "").trim().toLowerCase();
  if (!targetName && !targetModel) return null;
  return (Array.isArray(machines) ? machines : []).find((machine) => {
    const names = [machine?.name, machine?.modelName, ...(Array.isArray(machine?.aliases) ? machine.aliases : [])]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());
    return (targetModel && names.includes(targetModel)) || (targetName && names.includes(targetName));
  }) || null;
}

function archiveRiskVariance(archive, machines) {
  const snapshot = archive?.riskSnapshot;
  const machine = findMachineForArchive(archive, machines);
  const snapshotStdDev = finitePositive(snapshot?.stdDevBalls ?? snapshot?.stdDev);
  const machineStdDev = machine?.stdDevMethod === "p-evidence-branching-v2" ? finitePositive(machine?.stdDev) : null;
  const stdDevBalls = snapshotStdDev ?? machineStdDev;
  if (stdDevBalls == null) return null;

  const spins = finitePositive(archive?.stats?.netRot)
    ?? (() => {
      const minutes = finitePositive(archive?.playMinutes);
      const perHour = finitePositive(archive?.settings?.rotPerHour);
      return minutes != null && perHour != null ? (minutes * perHour) / 60 : null;
    })();
  if (spins == null) return null;

  const exchangeRate = finitePositive(archive?.settings?.exRate);
  const ballValueYen = finitePositive(snapshot?.ballValueYen)
    ?? finitePositive(archive?.settings?.ballVal)
    ?? (exchangeRate != null ? 1000 / exchangeRate : 4);
  const referenceSpins = finitePositive(snapshot?.referenceSpins) ?? STANDARD_SESSION_SPINS;
  const sigmaYen = stdDevBalls * ballValueYen * Math.sqrt(spins / referenceSpins);
  return {
    varianceYen2: sigmaYen ** 2,
    source: snapshotStdDev != null ? "snapshot" : "machine-master",
  };
}

export function buildMonthProjection({ archives, machines, now = new Date(), z = CENTRAL_80_Z } = {}) {
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthRecords = (Array.isArray(archives) ? archives : []).filter((archive) => String(archive?.date || "").startsWith(monthKey));
  const recordsWithActual = monthRecords.filter((archive) => getRealPL(archive) != null);
  const actualRows = recordsWithActual.map(getRealPL);
  const currentActual = actualRows.reduce((sum, value) => sum + value, 0);
  const currentExpected = monthRecords.reduce((sum, archive) => sum + getEvAmount(archive), 0);
  const comparableExpected = recordsWithActual.reduce((sum, archive) => sum + getEvAmount(archive), 0);
  const allActualComplete = monthRecords.length > 0 && recordsWithActual.length === monthRecords.length;
  const riskRows = monthRecords.map((archive) => archiveRiskVariance(archive, machines)).filter(Boolean);
  const observedVarianceYen2 = riskRows.reduce((sum, row) => sum + row.varianceYen2, 0);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsedDays = Math.max(1, Math.min(now.getDate(), daysInMonth));
  const remainingDays = Math.max(0, daysInMonth - elapsedDays);
  const futureScale = remainingDays / elapsedDays;
  const futureExpected = currentExpected * futureScale;
  const center = allActualComplete ? currentActual + futureExpected : null;
  const futureVarianceYen2 = observedVarianceYen2 * futureScale;
  const margin = riskRows.length && center != null ? z * Math.sqrt(futureVarianceYen2) : null;
  const dailyExpectedPace = currentExpected / elapsedDays;
  const variancePerDay = observedVarianceYen2 / elapsedDays;
  const projectionByDay = new Map();

  if (center != null && riskRows.length) {
    for (let day = elapsedDays; day <= daysInMonth; day += 1) {
      const futureDays = day - elapsedDays;
      const dayCenter = currentActual + dailyExpectedPace * futureDays;
      const dayMargin = z * Math.sqrt(variancePerDay * futureDays);
      projectionByDay.set(day, {
        center: Math.round(dayCenter),
        low: Math.round(dayCenter - dayMargin),
        high: Math.round(dayCenter + dayMargin),
      });
    }
  }

  return {
    monthKey,
    currentActual,
    currentExpected,
    hasActual: actualRows.length > 0,
    actualExpectedGap: actualRows.length ? currentActual - comparableExpected : null,
    comparableExpected,
    actualRecordCount: recordsWithActual.length,
    actualCoverage: monthRecords.length ? Math.round((recordsWithActual.length / monthRecords.length) * 100) : 0,
    center: center == null ? null : Math.round(center),
    low: margin == null ? null : Math.round(center - margin),
    high: margin == null ? null : Math.round(center + margin),
    confidence: 80,
    riskCoverage: monthRecords.length ? Math.round((riskRows.length / monthRecords.length) * 100) : 0,
    riskRecordCount: riskRows.length,
    recordCount: monthRecords.length,
    status: !actualRows.length ? "no-actual" : !allActualComplete ? "incomplete-actual" : !riskRows.length ? "insufficient" : "ready",
    projectionByDay,
  };
}
