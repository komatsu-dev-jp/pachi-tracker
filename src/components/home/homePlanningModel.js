import { getActualPL, getChodamaPL, getEvAmount } from "../analysis/analysisSelectors.js";

export const STANDARD_SESSION_SPINS = 2200;
export const CENTRAL_80_Z = 1.2815515655446004;

export const PLAY_STYLES = Object.freeze({
  stable: Object.freeze({
    id: "stable",
    label: "安定重視",
    shortLabel: "ブレ小さめ",
    description: "標準偏差が低い機種から、条件の良い台を探します。",
  }),
  balanced: Object.freeze({
    id: "balanced",
    label: "バランス",
    shortLabel: "収益と安定",
    description: "安定性と期待値の両方を見て、候補を比較します。",
  }),
  ev: Object.freeze({
    id: "ev",
    label: "期待値優先",
    shortLabel: "高変動も許容",
    description: "ブレの大きさを確認したうえで、高変動機も候補に含めます。",
  }),
});

const finitePositive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

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

function machineIdentity(machine) {
  return [machine?.name, machine?.modelName, ...(Array.isArray(machine?.aliases) ? machine.aliases : [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function preferredScore(machine, styleId) {
  const identity = machineIdentity(machine);
  if (styleId === "stable") {
    if (identity.includes("海物語")) return 0;
    if (identity.includes("甘デジ")) return 1;
    return 2;
  }
  if (styleId === "ev") {
    if (identity.includes("牙狼")) return 0;
    if (identity.includes("エヴァンゲリオン")) return 1;
    return 2;
  }
  if (identity.includes("海物語")) return 0;
  return 1;
}

export function buildStyleCandidates(machines, styleId = "balanced", limit = 3) {
  const list = Array.isArray(machines) ? machines : [];
  const reference = buildVolatilityReference(list);
  const rows = list
    .filter((machine) => machine?.stdDevMethod === "p-evidence-branching-v2" && finitePositive(machine?.stdDev) != null)
    .map((machine) => ({
      machine,
      risk: classifyMachineVolatility(machine.stdDev, reference),
    }));

  if (styleId === "ev") {
    // 「期待値優先」は高変動機だけを勧める意味ではない。
    // 店舗データが無い段階では、安定・標準・高変動を1台ずつ比較候補にして、
    // 実際の期待値順位は店舗データ取得後に決める。
    const tierOrder = ["high", "balanced", "stable"];
    const selected = tierOrder.flatMap((tier) => {
      const tierRows = rows.filter((row) => row.risk.tier === tier);
      tierRows.sort((a, b) => {
        const preferred = preferredScore(a.machine, tier === "high" ? "ev" : tier) - preferredScore(b.machine, tier === "high" ? "ev" : tier);
        if (preferred !== 0) return preferred;
        if (tier === "high") return Number(b.machine.stdDev) - Number(a.machine.stdDev);
        if (tier === "stable") return Number(a.machine.stdDev) - Number(b.machine.stdDev);
        return Math.abs(Number(a.machine.stdDev) - 16000) - Math.abs(Number(b.machine.stdDev) - 16000);
      });
      return tierRows.slice(0, 1);
    });
    return selected.slice(0, Math.max(0, limit)).map(({ machine, risk }) => ({
      name: machine.name,
      modelName: machine.modelName || "型式確認中",
      stdDev: Number(machine.stdDev),
      riskTier: risk.tier,
      riskLabel: risk.label,
      sourceUrl: machine.modelSourceUrl || machine.sourceUrls?.[0] || null,
    }));
  }

  const allowed = styleId === "stable"
    ? new Set(["stable"])
    : new Set(["stable", "balanced"]);

  const scoped = rows.filter((row) => allowed.has(row.risk.tier));
  scoped.sort((a, b) => {
    const preferred = preferredScore(a.machine, styleId) - preferredScore(b.machine, styleId);
    if (preferred !== 0) return preferred;
    if (styleId === "stable") return Number(a.machine.stdDev) - Number(b.machine.stdDev);
    return Math.abs(Number(a.machine.stdDev) - 16000) - Math.abs(Number(b.machine.stdDev) - 16000);
  });

  return scoped.slice(0, Math.max(0, limit)).map(({ machine, risk }) => ({
    name: machine.name,
    modelName: machine.modelName || "型式確認中",
    stdDev: Number(machine.stdDev),
    riskTier: risk.tier,
    riskLabel: risk.label,
    sourceUrl: machine.modelSourceUrl || machine.sourceUrls?.[0] || null,
  }));
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
