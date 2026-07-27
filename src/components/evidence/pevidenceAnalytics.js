// P-EVIDENCE v5 のGAS思想を、Google Sheetsに接続せずアプリ内で実行する解析エンジン。
//
// 重要な改善:
// - 店舗を台履歴キーに含め、別店舗の同じ台番号を混ぜない。
// - CUSUMの変化点を明示的に保持し、0リセットからレジーム切替を推測しない。
// - マルコフ遷移は本当に翌日の記録だけを数え、ベータ平滑化で0%/100%への暴走を防ぐ。
// - 期待値の上下限と勝率は、機種の標準偏差・予測誤差から計算する。

import { machineDB } from "../../machineDB.js";
import {
  DEFAULT_PRIOR_VARIANCE,
  estimateDeltaObservation,
  findMachineSpec,
  machineBorder,
  resolveMachineStats,
} from "../delta/deltaEvidence.js";
import { calculateStrategyEconomics } from "../../economics.js";
import { evidenceDayNumber, normalizeEvidenceDate } from "../../evidenceDate.js";
import {
  buildBacktestPairs,
  buildPEvidenceBacktest,
  estimateProcessNoise,
} from "./pevidenceBacktest.js";
import { priorBallsForEvidenceDate } from "./pevidenceCalibration.js";

export const PE_PARAMS = Object.freeze({
  emaAlpha: 2 / 8,
  cusumSlackMultiplier: 0.5,
  cusumThresholdMultiplier: 4,
  minDailySamples1K: 2,
  eventSlackBoost: 1.5,
  spatialWindow: 2,
  spatialConsensus: 0.6,
  markovMinTransitions: 5,
  markovDangerThreshold: 0.6,
  portfolioHours: 6,
  spinsPerHour: 210,
  sessionSpins: 1260,
  riskReferenceSpins: 2200,
  defaultPriorBalls: 50000,
  priorStrengthRatio: 0.25,
  partialPoolPriorBalls: 50000,
  partialPoolMaxAdjustment: 4,
  defaultProcessNoiseSd: 1.75,
  minProcessSamples: 12,
  processShrinkageSamples: 20,
  minProcessNoiseSd: 1.5,
  maxProcessNoiseSd: 5,
  lcbK: 1,
  selectionBiasMinSamples: 20,
  selectionBiasValidationWarmup: 10,
  selectionBiasPriorSamples: 20,
  selectionBiasMax: 3,
  graphStepBalls: 500,
  rentBalls: 250,
  exRate: 250,
  nonCashRatio: 0,
  cashLimit: 0,
  ballValueYen: 4,
});

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  const p = 10 ** digits;
  return Math.round(num(value) * p) / p;
}

export function normalCdf(x) {
  if (x < -10) return 0;
  if (x > 10) return 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  // normal CDF = 0.5 * (1 + erf(x / sqrt(2))).
  // The previous implementation passed x directly to the erf approximation,
  // which overstated positive probabilities (for example, z=1 became 92.1%).
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * ax);
  const erf = sign * (1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax));
  return 0.5 * (1 + erf);
}

function atLeastOneHitProbability(spins, denominator) {
  const n = Math.max(0, num(spins));
  const d = num(denominator);
  if (!(d > 0)) return null;
  if (n === 0) return 0;
  return 1 - ((1 - 1 / d) ** n);
}

export function outwardPercentBand(low, high, step = 5) {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  const lo = Math.min(low, high) * 100;
  const hi = Math.max(low, high) * 100;
  const safeStep = Math.max(1, num(step, 5));
  // 0% / 100% は保証に見えるため、概算表示では使わない。
  return {
    low: clamp(Math.floor(lo / safeStep) * safeStep, 1, 99),
    high: clamp(Math.ceil(hi / safeStep) * safeStep, 1, 99),
  };
}

function normalizedMachineIdentity(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s・･:：/／\\()（）\u005b\u005d［］【】「」『』.,，。_-]/g, "");
}

function hasExactMachineIdentity(machine, inputName) {
  const input = normalizedMachineIdentity(inputName);
  if (!input) return false;
  return [machine?.name, machine?.modelName, ...(Array.isArray(machine?.aliases) ? machine.aliases : [])]
    .some((value) => normalizedMachineIdentity(value) === input);
}

function dateKey(value) {
  return normalizeEvidenceDate(value);
}

function dayNumber(value) {
  return evidenceDayNumber(value);
}

function dayOfWeek(value) {
  const key = dateKey(value);
  if (!key) return 0;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function baseMachineNumber(value) {
  return String(value ?? "").replace(/_旧.*/, "").trim();
}

function storeKey(scan, row) {
  return String(scan?.storeId ?? row?.storeId ?? scan?.storeName ?? row?.storeName ?? row?.store ?? "").trim();
}

function hasExplicitError(row) {
  const status = String(row?.status ?? row?.statusStr ?? row?.qualityStatus ?? "").trim();
  if (status === "review" && row?.reviewConfirmed === true) return false;
  return Boolean(status) && !["正常", "ok", "OK", "有効"].includes(status);
}

export function classifyEvidenceScore(score, confidence) {
  const normalizedConfidence = num(confidence);
  const confidenceRatio = normalizedConfidence > 1 ? normalizedConfidence / 100 : normalizedConfidence;
  if (confidenceRatio < 0.2) return "nodata";
  if (num(score) >= 50) return "strong";
  if (num(score) >= 10) return "watch";
  return "weak";
}

function hasUsableDeltaValue(row) {
  if (row?.val === null || row?.val === undefined || row?.val === "") return false;
  return Number.isFinite(Number(row.val)) && !hasExplicitError(row);
}

function latestRows(scans = [], { includeInvalid = false } = {}) {
  const map = new Map();
  for (const scan of scans || []) {
    for (const row of scan?.rows || []) {
      if (!includeInvalid && !hasUsableDeltaValue(row)) continue;
      const scanDate = dateKey(scan?.date);
      const hasExplicitRowDate = row?.date !== null && row?.date !== undefined && String(row.date).trim() !== "";
      const rowDate = hasExplicitRowDate ? dateKey(row.date) : "";
      const dateInvalid = hasExplicitRowDate && (!rowDate || (scanDate && rowDate !== scanDate));
      if (!includeInvalid && dateInvalid) continue;
      const date = includeInvalid && dateInvalid ? scanDate : (rowDate || scanDate);
      const machineName = String(row?.machineName || scan?.machineName || "").trim();
      const number = baseMachineNumber(row?.num);
      const store = storeKey(scan, row);
      if (!date || !machineName || !number) continue;
      const key = `${store}___${date}___${machineName}___${number}`;
      const createdAt = String(scan?.createdAt || "");
      const previous = map.get(key);
      if (!previous || createdAt >= previous.createdAt) {
        map.set(key, {
          ...row,
          date,
          dateInvalid,
          sourceRowDate: hasExplicitRowDate ? String(row.date) : "",
          store,
          storeId: scan?.storeId ?? row?.storeId ?? null,
          storeName: scan?.storeName || row?.storeName || row?.store || "",
          machineName,
          num: number,
          island: row?.island || "",
          event: row?.event || scan?.event || "",
          createdAt,
        });
      }
    }
  }
  return [...map.values()].sort((a, b) =>
    dayNumber(a.date) - dayNumber(b.date) ||
    a.store.localeCompare(b.store) ||
    a.machineName.localeCompare(b.machineName) ||
    num(a.num) - num(b.num)
  );
}

function estimateDaily(row, machine, params) {
  const normalSpins = Math.max(0, num(row.normalSpins));
  const totalStarts = Math.max(0, num(row.totalStarts));
  const deltaBalls = hasUsableDeltaValue(row) ? Number(row.val) : 0;
  const border = machineBorder(machine);
  const stats = resolveMachineStats(machine);
  if (row?.dateInvalid) {
    return {
      valid: false,
      inactive: false,
      activityStatus: "invalid",
      reason: "行の日付がスキャン日と不一致",
      normalSpins,
      totalStarts,
      deltaBalls,
      border,
      stats,
    };
  }
  const inactive = normalSpins === 0 && totalStarts === 0 && deltaBalls === 0 && hasUsableDeltaValue(row);
  if (inactive) {
    return {
      valid: false,
      inactive: true,
      activityStatus: "inactive",
      reason: "未稼働",
      normalSpins,
      totalStarts,
      deltaBalls,
      border,
      stats,
    };
  }
  if (!(border > 0) || !hasUsableDeltaValue(row)) {
    return {
      valid: false,
      inactive: false,
      activityStatus: "invalid",
      reason: !(border > 0)
        ? "ボーダー未設定"
        : hasExplicitError(row) ? "読取状態が未確定" : "差玉未読取",
      normalSpins,
      totalStarts,
      deltaBalls,
      border,
      stats,
    };
  }

  // 1日の物理観測は Delta エンジンと完全に共通化する。
  // P-EVIDENCE はこの共通観測へ EMA/CUSUM/事後推定だけを重ねる。
  const observation = estimateDeltaObservation(row, machine, {
    graphStepBalls: params.graphStepBalls,
    minRate: 5,
    maxRate: 45,
  });
  if (!observation.valid) {
    return {
      ...observation,
      inactive: false,
      activityStatus: "invalid",
      normalSpins,
      totalStarts,
      deltaBalls,
      border,
      stats,
    };
  }

  const estimatedInputBalls = observation.estimatedInputBalls;
  const dailyRate = observation.observedRotation;
  const derivative = 250 * normalSpins / Math.max(1, estimatedInputBalls ** 2);
  const dailyStandardError = Math.max(0.15, derivative * Math.sqrt(Math.max(0, observation.inputVariance)));
  return {
    valid: true,
    inactive: false,
    activityStatus: "active",
    normalSpins,
    totalStarts,
    deltaBalls,
    border,
    stats,
    estimatedInputBalls,
    dailyRate,
    dailyStandardError,
    inputVariance: observation.inputVariance,
  };
}

function historyKey(row) {
  return `${row.store}___${row.machineName}___${row.num}`;
}

function profileKey(row) {
  return `${row.store}___${row.machineName}`;
}

function islandKey(row) {
  return `${row.store}___${row.island || `${row.machineName}島`}`;
}

function correctionForRow(row, machine, payoutCorrections = []) {
  const rowStore = String(row?.store || "").trim();
  const identities = new Set([
    row?.machineName,
    machine?.name,
    machine?.modelName,
    ...(Array.isArray(machine?.aliases) ? machine.aliases : []),
  ].map(normalizedMachineIdentity).filter(Boolean));
  return (Array.isArray(payoutCorrections) ? payoutCorrections : []).find((profile) => (
    profile?.eligible === true
    && String(profile?.store || "").trim() === rowStore
    && identities.has(normalizedMachineIdentity(profile?.machineName))
    && (!profile?.effectiveFrom || dayNumber(row?.date) >= dayNumber(profile.effectiveFrom))
    && num(profile?.correctedAvgPayout) > 0
  )) || null;
}

function addResidualStat(map, key, row) {
  if (!key || !row?.estimate?.valid) return;
  const inputBalls = Math.max(0, num(row.estimate.estimatedInputBalls));
  if (!(inputBalls > 0)) return;
  const residual = num(row.estimate.dailyRate) - num(row.border);
  const current = map.get(key) || { weightedResidual: 0, inputBalls: 0, count: 0 };
  current.weightedResidual += residual * inputBalls;
  current.inputBalls += inputBalls;
  current.count += 1;
  map.set(key, current);
}

function residualSource(stat, params, weight, type) {
  if (!stat || !(stat.inputBalls > 0) || !(stat.count > 0)) return null;
  const reliability = stat.inputBalls / (
    stat.inputBalls + Math.max(2500, num(params.partialPoolPriorBalls, 50000))
  );
  return {
    type,
    count: stat.count,
    inputBalls: stat.inputBalls,
    residual: stat.weightedResidual / stat.inputBalls,
    reliability,
    weight,
  };
}

function peerResidualStat(map, key, row) {
  const stat = map.get(key);
  if (!stat || !row?.estimate?.valid) return null;
  const ownBalls = Math.max(0, num(row.estimate.estimatedInputBalls));
  const peerBalls = stat.inputBalls - ownBalls;
  const peerCount = stat.count - 1;
  if (!(peerBalls > 0) || !(peerCount > 0)) return null;
  const ownResidual = num(row.estimate.dailyRate) - num(row.border);
  return {
    weightedResidual: stat.weightedResidual - ownResidual * ownBalls,
    inputBalls: peerBalls,
    count: peerCount,
  };
}

/**
 * Builds a store/machine/island/weekday prior without future leakage.
 * Historical buckets are updated only after a whole date is evaluated, and
 * same-day peer buckets explicitly remove the target machine itself.
 */
function attachPartialPoolPriors(rows, params) {
  const ordered = [...rows].sort((left, right) => (
    dayNumber(left.date) - dayNumber(right.date)
    || historyKey(left).localeCompare(historyKey(right))
  ));
  const sameDayMachine = new Map();
  const sameDayIsland = new Map();
  for (const row of ordered) {
    addResidualStat(sameDayMachine, `${row.date}___${profileKey(row)}`, row);
    addResidualStat(sameDayIsland, `${row.date}___${islandKey(row)}`, row);
  }

  const historical = {
    store: new Map(),
    machine: new Map(),
    island: new Map(),
    weekday: new Map(),
  };
  const weights = {
    store: 0.1,
    machine: 0.25,
    island: 0.2,
    weekday: 0.1,
    sameDayMachine: 0.15,
    sameDayIsland: 0.2,
  };
  const output = [];
  let index = 0;
  while (index < ordered.length) {
    const date = ordered[index].date;
    const batch = [];
    while (index < ordered.length && ordered[index].date === date) {
      batch.push(ordered[index]);
      index += 1;
    }

    for (const row of batch) {
      if (!row.estimate.valid) {
        output.push({
          ...row,
          priorMean: row.border,
          priorAdjustment: 0,
          priorSources: [],
        });
        continue;
      }
      const sources = [
        residualSource(historical.store.get(row.store), params, weights.store, "store-history"),
        residualSource(historical.machine.get(profileKey(row)), params, weights.machine, "machine-history"),
        residualSource(historical.island.get(islandKey(row)), params, weights.island, "island-history"),
        residualSource(
          historical.weekday.get(`${row.store}___${dayOfWeek(row.date)}`),
          params,
          weights.weekday,
          "weekday-history",
        ),
        residualSource(
          peerResidualStat(sameDayMachine, `${row.date}___${profileKey(row)}`, row),
          params,
          weights.sameDayMachine,
          "same-day-machine-peers",
        ),
        residualSource(
          peerResidualStat(sameDayIsland, `${row.date}___${islandKey(row)}`, row),
          params,
          weights.sameDayIsland,
          "same-day-island-peers",
        ),
      ].filter(Boolean);
      const rawAdjustment = sources.reduce(
        (sum, source) => sum + source.weight * source.reliability * source.residual,
        0,
      );
      const maxAdjustment = Math.max(0, num(params.partialPoolMaxAdjustment, 4));
      const priorAdjustment = clamp(rawAdjustment, -maxAdjustment, maxAdjustment);
      output.push({
        ...row,
        priorMean: Math.max(0, row.border + priorAdjustment),
        priorAdjustment,
        priorSources: sources,
      });
    }

    for (const row of batch) {
      addResidualStat(historical.store, row.store, row);
      addResidualStat(historical.machine, profileKey(row), row);
      addResidualStat(historical.island, islandKey(row), row);
      addResidualStat(historical.weekday, `${row.store}___${dayOfWeek(row.date)}`, row);
    }
  }
  return output;
}

function createProcessedRows(rawRows, customMachines, params, payoutCorrections = []) {
  const grouped = new Map();
  const prepared = [];
  for (const raw of rawRows) {
    const resolvedMachine = findMachineSpec(raw.machineName, customMachines, machineDB);
    if (!resolvedMachine) continue;
    const payoutCorrection = correctionForRow(raw, resolvedMachine, payoutCorrections);
    const payoutAdjustedMachine = payoutCorrection
      ? {
          ...resolvedMachine,
          avgPayoutPerHit: payoutCorrection.correctedAvgPayout,
          payoutCorrection,
        }
      : resolvedMachine;
    const datedPriorBalls = priorBallsForEvidenceDate(payoutAdjustedMachine, raw.date);
    const machine = datedPriorBalls > 0
      ? { ...payoutAdjustedMachine, muraCoef: datedPriorBalls }
      : payoutAdjustedMachine;
    const estimate = estimateDaily(raw, machine, params);
    prepared.push({
      ...raw,
      machine,
      estimate,
      border: machineBorder(machine),
      payoutCorrection: payoutCorrection || null,
    });
  }
  for (const row of attachPartialPoolPriors(prepared, params)) {
    const key = historyKey(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const output = [];
  for (const list of grouped.values()) {
    list.sort((a, b) => dayNumber(a.date) - dayNumber(b.date));
    let cumulativeSpins = 0;
    let cumulativeInputBalls = 0;
    let cumulativeInputVariance = 0;
    let ema = null;
    let cusumUp = 0;
    let cusumDown = 0;
    let regimeStart = list[0]?.date || "";
    let regimeDirection = null;
    let regimeSpins = 0;
    let regimeInputBalls = 0;
    let regimeInputVariance = 0;

    for (const row of list) {
      const e = row.estimate;
      if (!e.valid) {
        output.push({
          ...row,
          valid: false,
          inactive: e.inactive === true,
          activityStatus: e.activityStatus || "invalid",
          exclusionReason: e.reason || "計算データ不足",
          ema: ema ?? row.border,
          priorEma: ema ?? row.border,
          cusumUp,
          cusumDown,
        });
        continue;
      }

      const priorEma = ema ?? e.dailyRate;
      const dailySamples = e.estimatedInputBalls / 250;
      // 1日だけの出玉ブレをそのままCUSUMへ入れると閾値が極端に大きくなるため、
      // 回転率の変化検知に使うシグマは0.5〜3.0回/kへ制限する。
      const signalSigma = clamp(e.dailyStandardError, 0.5, 3);
      let slack = signalSigma * params.cusumSlackMultiplier;
      if (row.event || [0, 6].includes(dayOfWeek(row.date))) slack *= params.eventSlackBoost;
      const threshold = Math.max(1.5, signalSigma * params.cusumThresholdMultiplier);
      let changePoint = null;

      if (dailySamples >= params.minDailySamples1K && ema != null) {
        const residual = e.dailyRate - priorEma;
        const nextUp = Math.max(0, cusumUp + residual - slack);
        const nextDown = Math.max(0, cusumDown - residual - slack);
        if (nextUp >= threshold || nextDown >= threshold) {
          changePoint = nextUp >= threshold ? "open" : "tight";
          cusumUp = 0;
          cusumDown = 0;
          ema = e.dailyRate;
          regimeStart = row.date;
          regimeDirection = changePoint;
          regimeSpins = 0;
          regimeInputBalls = 0;
          regimeInputVariance = 0;
        } else {
          cusumUp = nextUp;
          cusumDown = nextDown;
          ema = params.emaAlpha * e.dailyRate + (1 - params.emaAlpha) * priorEma;
        }
      } else {
        ema = ema == null ? e.dailyRate : params.emaAlpha * e.dailyRate + (1 - params.emaAlpha) * ema;
      }

      cumulativeSpins += e.normalSpins;
      cumulativeInputBalls += e.estimatedInputBalls;
      cumulativeInputVariance += (e.dailyStandardError * e.estimatedInputBalls ** 2 / Math.max(1, 250 * e.normalSpins)) ** 2;
      regimeSpins += e.normalSpins;
      regimeInputBalls += e.estimatedInputBalls;
      regimeInputVariance += (e.dailyStandardError * e.estimatedInputBalls ** 2 / Math.max(1, 250 * e.normalSpins)) ** 2;

      const postSamples = cumulativeInputBalls / 250;
      const regimeSamples = regimeInputBalls / 250;
      const cumulativeRate = postSamples >= 1 ? cumulativeSpins / postSamples : row.border;
      const regimeRate = regimeSamples >= 2 ? regimeSpins / regimeSamples : 0;
      const usesRegimeRate = regimeSamples >= 4 && regimeRate > 0;
      const activeRate = usesRegimeRate ? regimeRate : cumulativeRate;
      // 変化点後は変化前のデータを推定に使わないため、信頼度も
      // 推定に実際に使っている玉数（新レジーム分）だけで計算する。
      const confidenceBalls = usesRegimeRate ? regimeInputBalls : cumulativeInputBalls;
      const confidenceSamples = confidenceBalls / 250;
      // The prior no longer fades toward zero merely because more balls were
      // observed. More data can reduce measurement error, but it cannot erase
      // the possibility that the nail state changes overnight.
      const priorBalls = Math.max(
        2500,
        num(row.machine?.muraCoef, params.defaultPriorBalls)
          * clamp(num(params.priorStrengthRatio, 0.25), 0.05, 1),
      );
      const confidence = confidenceSamples / (confidenceSamples + priorBalls / 250);
      const priorMean = num(row.priorMean, row.border);
      const predictedRotation = activeRate * confidence + priorMean * (1 - confidence);
      const activeSpins = usesRegimeRate ? regimeSpins : cumulativeSpins;
      const activeInputBalls = usesRegimeRate ? regimeInputBalls : cumulativeInputBalls;
      const activeInputVariance = usesRegimeRate ? regimeInputVariance : cumulativeInputVariance;
      const aggregateDerivative = 250 * activeSpins / Math.max(1, activeInputBalls ** 2);
      const standardError = Math.max(0.12, aggregateDerivative * Math.sqrt(Math.max(0, activeInputVariance)));
      // 3エンジン共通の区間式（deltaEvidence と同一）: 予測は実測×信頼度+ボーダー×(1-信頼度)の
      // 合成なので、区間幅も conf²·SE² + (1-conf)²·priorVariance のベイズ事後分散から取る。
      // 従来の SE×conf は信頼度ゼロ付近で区間幅0（＝データなしで断定）に潰れていた。
      const posteriorSd = Math.sqrt((confidence * standardError) ** 2 + ((1 - confidence) ** 2) * DEFAULT_PRIOR_VARIANCE);
      const predictedLow = Math.max(0, predictedRotation - 1.96 * posteriorSd);
      const predictedHigh = predictedRotation + 1.96 * posteriorSd;

      output.push({
        ...row,
        valid: true,
        dailyRate: e.dailyRate,
        estimatedInputBalls: e.estimatedInputBalls,
        dailyStandardError: e.dailyStandardError,
        cumulativeSpins,
        cumulativeInputBalls,
        ema,
        priorEma,
        cusumUp,
        cusumDown,
        cusumThreshold: threshold,
        changePoint,
        regimeStart,
        regimeDirection,
        regimeSpins,
        regimeInputBalls,
        regimeInputVariance,
        regimeRate,
        confidence,
        dataConfidence: confidence,
        priorBalls,
        predictedRotation,
        predictedLow,
        predictedHigh,
        posteriorVariance: posteriorSd ** 2,
        standardError,
      });
    }
  }
  return output.sort((a, b) => dayNumber(a.date) - dayNumber(b.date));
}

function applyProcessNoise(rows, processNoise, params) {
  return rows.map((row) => {
    if (!row.valid) return row;
    const key = profileKey(row);
    const profile = processNoise?.byProfile?.[key] || processNoise?.global || null;
    const processVariance = Math.max(
      0,
      num(profile?.variance, num(params.defaultProcessNoiseSd, 1.75) ** 2),
    );
    const posteriorVariance = Math.max(0, num(row.posteriorVariance));
    const nextDayVariance = posteriorVariance + processVariance;
    const predictiveSd = Math.sqrt(nextDayVariance);
    const dataConfidence = clamp(num(row.dataConfidence ?? row.confidence), 0, 1);
    // DEFAULT_PRIOR_VARIANCE is four (SD=2 rotations/k). Comparing the
    // irreducible overnight variance with that scale gives an interpretable
    // forecast-reliability cap while retaining the raw data confidence.
    const processReliability = DEFAULT_PRIOR_VARIANCE / (
      DEFAULT_PRIOR_VARIANCE + processVariance
    );
    const forecastConfidence = clamp(dataConfidence * processReliability, 0, 0.99);
    return {
      ...row,
      dataConfidence,
      confidence: forecastConfidence,
      forecastConfidence,
      processReliability,
      processVariance,
      processNoiseSd: Math.sqrt(processVariance),
      processNoiseSource: profile?.source || "default",
      processNoiseSamples: Math.max(0, num(profile?.n)),
      nextDayVariance,
      predictedLow: Math.max(0, row.predictedRotation - 1.96 * predictiveSd),
      predictedHigh: row.predictedRotation + 1.96 * predictiveSd,
    };
  });
}

function buildStoreProfiles(rows) {
  const buckets = new Map();
  const histories = new Map();
  for (const row of rows.filter((item) => item.valid)) {
    const key = historyKey(row);
    if (!histories.has(key)) histories.set(key, []);
    histories.get(key).push(row);
  }
  for (const history of histories.values()) {
    history.sort((a, b) => dayNumber(a.date) - dayNumber(b.date));
    for (let i = 1; i < history.length; i++) {
      const current = history[i];
      const previous = history[i - 1];
      if (dayNumber(current.date) - dayNumber(previous.date) !== 1) continue;
      const key = profileKey(current);
      if (!buckets.has(key)) buckets.set(key, Array.from({ length: 7 }, () => ({ tight: 0, total: 0 })));
      const bucket = buckets.get(key)[dayOfWeek(current.date)];
      bucket.total += 1;
      if (previous.ema - current.dailyRate >= 1) bucket.tight += 1;
    }
  }
  return [...buckets.entries()].map(([key, days]) => {
    const [store, machineName] = key.split("___");
    return {
      key,
      store,
      machineName,
      days: days.map((day) => ({ ...day, rate: day.total ? day.tight / day.total : 0, enough: day.total >= 3 })),
    };
  });
}

function betaRate(successes, total, fallback) {
  return total > 0 ? (successes + fallback * 8) / (total + 8) : fallback;
}

function emptyTransitionSummary() {
  return {
    AA: 0,
    AB: 0,
    BA: 0,
    BB: 0,
    goodTight: 0,
    goodTotal: 0,
    badTight: 0,
    badTotal: 0,
    openShockTight: 0,
    openShockTotal: 0,
    eventTight: 0,
    eventTotal: 0,
    streakTight: 0,
    streakTotal: 0,
    tightResidualSum: 0,
    tightResidualSq: 0,
    tightResidualCount: 0,
    holdResidualSum: 0,
    holdResidualSq: 0,
    holdResidualCount: 0,
    weekdays: Array.from({ length: 7 }, () => ({ tight: 0, total: 0 })),
  };
}

function addTransition(summary, prev, current, streak) {
  const prevState = prev.ema >= prev.border + 0.5 ? "A" : "B";
  const state = current.ema >= current.border + 0.5 ? "A" : "B";
  summary[prevState + state] += 1;
  const tight = num(current.dailyRate) <= num(prev.ema) - 1;
  if (prevState === "A") {
    summary.goodTotal += 1;
    if (tight) summary.goodTight += 1;
  } else {
    summary.badTotal += 1;
    if (tight) summary.badTight += 1;
  }
  const openShock = prev.changePoint === "open"
    || num(prev.dailyRate) - num(prev.priorEma, prev.ema) >= 2;
  if (openShock) {
    summary.openShockTotal += 1;
    if (tight) summary.openShockTight += 1;
  }
  if (prev.event) {
    summary.eventTotal += 1;
    if (tight) summary.eventTight += 1;
  }
  if (streak >= 3) {
    summary.streakTotal += 1;
    if (tight) summary.streakTight += 1;
  }
  const weekday = summary.weekdays[dayOfWeek(current.date)];
  weekday.total += 1;
  if (tight) weekday.tight += 1;
  const residual = num(current.dailyRate) - num(current.border);
  if (tight) {
    summary.tightResidualSum += residual;
    summary.tightResidualSq += residual ** 2;
    summary.tightResidualCount += 1;
  } else {
    summary.holdResidualSum += residual;
    summary.holdResidualSq += residual ** 2;
    summary.holdResidualCount += 1;
  }
  return { prevState, state, tight, openShock };
}

function pooledMean(localSum, localCount, globalMean, strength = 8) {
  return (localSum + globalMean * strength) / (localCount + strength);
}

function transitionProfile(key, summary, globalSummary, params) {
  const [store, machineName] = key.split("___");
  const globalGood = betaRate(globalSummary.goodTight, globalSummary.goodTotal, 0.2);
  const globalBad = betaRate(globalSummary.badTight, globalSummary.badTotal, 0.5);
  const globalOpen = betaRate(
    globalSummary.openShockTight,
    globalSummary.openShockTotal,
    (globalGood + globalBad) / 2,
  );
  const globalEvent = betaRate(
    globalSummary.eventTight,
    globalSummary.eventTotal,
    (globalGood + globalBad) / 2,
  );
  const globalTightResidual = globalSummary.tightResidualCount
    ? globalSummary.tightResidualSum / globalSummary.tightResidualCount
    : -1;
  const globalHoldResidual = globalSummary.holdResidualCount
    ? globalSummary.holdResidualSum / globalSummary.holdResidualCount
    : 0;
  const totalA = summary.AA + summary.AB;
  const totalB = summary.BA + summary.BB;
  return {
    key,
    store,
    machineName,
    counts: summary,
    goodToGood: betaRate(summary.AA, totalA, 0.8),
    goodToTight: betaRate(summary.goodTight, summary.goodTotal, globalGood),
    badToGood: betaRate(summary.BA, totalB, 0.5),
    badToBad: betaRate(summary.badTight, summary.badTotal, globalBad),
    openShockNextTight: betaRate(
      summary.openShockTight,
      summary.openShockTotal,
      globalOpen,
    ),
    eventNextTight: betaRate(summary.eventTight, summary.eventTotal, globalEvent),
    streak3NextTight: betaRate(
      summary.streakTight,
      summary.streakTotal,
      (globalGood + globalBad) / 2,
    ),
    weekdays: summary.weekdays.map((day, weekday) => {
      const globalDay = globalSummary.weekdays[weekday];
      const fallback = betaRate(
        globalDay.tight,
        globalDay.total,
        (globalGood + globalBad) / 2,
      );
      return {
        ...day,
        rate: betaRate(day.tight, day.total, fallback),
        reliability: day.total / (day.total + 8),
      };
    }),
    tightResidual: pooledMean(
      summary.tightResidualSum,
      summary.tightResidualCount,
      globalTightResidual,
    ),
    holdResidual: pooledMean(
      summary.holdResidualSum,
      summary.holdResidualCount,
      globalHoldResidual,
    ),
    enoughGood: summary.goodTotal >= params.markovMinTransitions,
    enoughBad: summary.badTotal >= params.markovMinTransitions,
  };
}

function buildMarkov(rows, params) {
  const histories = new Map();
  for (const row of rows.filter((item) => item.valid)) {
    const key = historyKey(row);
    if (!histories.has(key)) histories.set(key, []);
    histories.get(key).push(row);
  }
  const summaries = new Map();
  const globalSummary = emptyTransitionSummary();
  for (const history of histories.values()) {
    history.sort((a, b) => dayNumber(a.date) - dayNumber(b.date));
    const pKey = profileKey(history[0]);
    if (!summaries.has(pKey)) summaries.set(pKey, emptyTransitionSummary());
    const summary = summaries.get(pKey);
    let streak = 0;
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const current = history[i];
      if (dayNumber(current.date) - dayNumber(prev.date) !== 1) {
        streak = 0;
        continue;
      }
      const prevState = prev.ema >= prev.border + 0.5 ? "A" : "B";
      streak = prevState === "A" ? streak + 1 : 0;
      addTransition(summary, prev, current, streak);
      addTransition(globalSummary, prev, current, streak);
    }
  }

  const profiles = [...summaries.entries()].map(([key, summary]) => (
    transitionProfile(key, summary, globalSummary, params)
  ));
  const global = transitionProfile("全店舗___全機種", globalSummary, globalSummary, params);
  return {
    profiles,
    global,
    byKey: new Map(profiles.map((item) => [item.key, item])),
  };
}

function latestByHistory(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = historyKey(row);
    const previous = map.get(key);
    if (!previous || dayNumber(row.date) >= dayNumber(previous.date)) map.set(key, row);
  }
  return [...map.values()];
}

function buildSpatial(latest, params) {
  const groups = new Map();
  for (const row of latest.filter((item) => item.valid)) {
    const key = `${row.store}___${row.date}___${row.machineName}___${row.island || ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const result = new Map();
  for (const group of groups.values()) {
    const byNum = new Map(group.map((row) => [num(row.num, NaN), row]));
    for (const row of group) {
      const number = num(row.num, NaN);
      const neighbors = [];
      for (let offset = -params.spatialWindow; offset <= params.spatialWindow; offset++) {
        if (offset && byNum.has(number + offset)) neighbors.push(byNum.get(number + offset));
      }
      if (neighbors.length < 2) {
        result.set(historyKey(row), { code: "insufficient", label: "隣接データ不足", downRate: 0, upRate: 0 });
        continue;
      }
      const downRate = neighbors.filter((item) => item.cusumDown > 0 || item.changePoint === "tight").length / neighbors.length;
      const upRate = neighbors.filter((item) => item.cusumUp > 0 || item.changePoint === "open").length / neighbors.length;
      let code = "neutral";
      let label = "隣接異常なし";
      if ((row.cusumDown > 0 || row.changePoint === "tight") && downRate >= params.spatialConsensus) { code = "tight-row"; label = `列一斉締め ${Math.round(downRate * 100)}%`; }
      else if ((row.cusumUp > 0 || row.changePoint === "open") && upRate >= params.spatialConsensus) { code = "open-row"; label = `列一斉開け ${Math.round(upRate * 100)}%`; }
      else if (downRate >= params.spatialConsensus) { code = "tight-wave"; label = "隣接締め波及注意"; }
      else if (upRate >= params.spatialConsensus) { code = "open-wave"; label = "隣接開け波及予兆"; }
      result.set(historyKey(row), { code, label, downRate, upRate, neighborCount: neighbors.length });
    }
  }
  return result;
}

function buildOppositePairs(islands = []) {
  const pairs = new Map();
  const byId = new Map((islands || []).map((island) => [String(island?.id || ""), island]));
  const handled = new Set();
  for (const left of islands || []) {
    const right = byId.get(String(left?.facingIslandId || ""));
    if (!right || right === left) continue;
    const relationKey = [String(left.id), String(right.id)].sort().join("___");
    if (handled.has(relationKey)) continue;
    handled.add(relationKey);
    const aStart = num(left?.start, NaN);
    const aEnd = num(left?.end, NaN);
    const bStart = num(right?.start, NaN);
    const bEnd = num(right?.end, NaN);
    if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) continue;
    const a = [];
    const b = [];
    for (let n = Math.min(aStart, aEnd); n <= Math.max(aStart, aEnd); n++) a.push(String(n));
    for (let n = Math.min(bStart, bEnd); n <= Math.max(bStart, bEnd); n++) b.push(String(n));
    const count = Math.min(a.length, b.length);
    const reverse = left?.facingReversed !== false;
    for (let j = 0; j < count; j++) {
      const oppositeIndex = reverse ? b.length - 1 - j : j;
      if (oppositeIndex < 0 || oppositeIndex >= b.length) continue;
      pairs.set(a[j], b[oppositeIndex]);
      pairs.set(b[oppositeIndex], a[j]);
    }
  }
  return pairs;
}

function buildOpposite(latest, islands) {
  const pairs = buildOppositePairs(islands);
  const lookup = new Map(latest.map((row) => [`${row.store}___${row.date}___${row.num}`, row]));
  const result = new Map();
  for (const row of latest) {
    const oppositeNum = pairs.get(String(row.num));
    if (!oppositeNum) {
      result.set(historyKey(row), { code: "none", label: "対面設定なし" });
      continue;
    }
    const opposite = lookup.get(`${row.store}___${row.date}___${oppositeNum}`);
    if (!opposite?.valid) {
      result.set(historyKey(row), { code: "missing", label: `対面${oppositeNum} データなし`, oppositeNum });
      continue;
    }
    const myDown = row.cusumDown > 0 || row.changePoint === "tight";
    const myUp = row.cusumUp > 0 || row.changePoint === "open";
    const oppDown = opposite.cusumDown > 0 || opposite.changePoint === "tight";
    const oppUp = opposite.cusumUp > 0 || opposite.changePoint === "open";
    let code = "neutral";
    let label = `対面${oppositeNum} 異常なし`;
    if (myDown && oppDown) { code = "tight-linked"; label = `背面連動締め 対面${oppositeNum}`; }
    else if (myUp && oppUp) { code = "open-linked"; label = `背面連動開け 対面${oppositeNum}`; }
    else if (oppDown) { code = "tight-wave"; label = `対面締め波及注意 対面${oppositeNum}`; }
    else if (oppUp) { code = "open-wave"; label = `対面開け波及予兆 対面${oppositeNum}`; }
    result.set(historyKey(row), { code, label, oppositeNum });
  }
  return result;
}

function economics(row, params) {
  const rotation = row.predictedRotation;
  const equivalentBorder = row.border;
  const exchangeRate = num(params.exRate) > 0
    ? num(params.exRate)
    : (num(params.ballValueYen) > 0 ? 1000 / num(params.ballValueYen) : 250);
  const economicsOptions = {
    equivalentBorder,
    rentBalls: params.rentBalls,
    exRate: exchangeRate,
    nonCashRatio: params.nonCashRatio,
  };
  const centerEconomics = calculateStrategyEconomics({ ...economicsOptions, rotation });
  const lowEconomics = calculateStrategyEconomics({ ...economicsOptions, rotation: row.predictedLow });
  const highEconomics = calculateStrategyEconomics({ ...economicsOptions, rotation: row.predictedHigh });
  const unitPrice = centerEconomics.evPerRot;
  const hourly = unitPrice * params.spinsPerHour;
  const daily = unitPrice * params.sessionSpins;
  const lowUnit = row.predictedLow > 0 ? lowEconomics.evPerRot : null;
  const highUnit = row.predictedHigh > 0 ? highEconomics.evPerRot : null;
  // 収支プラス見込みには、機種マスタで検証済みの標準偏差だけを使う。
  // resolveMachineStats() の補完値は差玉から回転率を推定する内部用途に限り、
  // 利用者へ見せる勝率へは流用しない。
  const machine = row.machine || {};
  const exactModelReady = machine.modelVerified === true
    && Boolean(machine.modelName)
    && hasExactMachineIdentity(machine, row.machineName);
  const volatilityReady = exactModelReady
    && machine.stdDevMethod === "p-evidence-branching-v2"
    && num(machine.stdDev) > 0;
  const referenceSpins = Math.max(1, num(params.riskReferenceSpins, 2200));
  const sessionSpins = Math.max(0, num(params.sessionSpins));
  const spinsPerHour = Math.max(0, num(params.spinsPerHour));
  const ballValueYen = Math.max(0, num(params.ballValueYen));
  const referenceRiskYen = volatilityReady && ballValueYen > 0
    ? num(machine.stdDev) * ballValueYen
    : null;
  const hourlyRisk = referenceRiskYen == null || spinsPerHour <= 0
    ? null
    : referenceRiskYen * Math.sqrt(spinsPerHour / referenceSpins);
  const sessionRisk = referenceRiskYen == null || sessionSpins <= 0
    ? null
    : referenceRiskYen * Math.sqrt(sessionSpins / referenceSpins);

  let profitChanceStatus = "ready";
  if (!exactModelReady) profitChanceStatus = "model-unverified";
  else if (!volatilityReady) profitChanceStatus = "stddev-unverified";
  else if (!(sessionSpins > 0) || !(ballValueYen > 0)) profitChanceStatus = "plan-missing";
  else if (!(row.predictedLow > 0) || !(row.predictedHigh > 0)) profitChanceStatus = "rotation-range-missing";
  else if (row.confidence < 0.2) profitChanceStatus = "low-confidence";

  const winRate = profitChanceStatus === "ready" ? normalCdf(daily / sessionRisk) : null;
  const winRateLow = profitChanceStatus === "ready" ? normalCdf((lowUnit * sessionSpins) / sessionRisk) : null;
  const winRateHigh = profitChanceStatus === "ready" ? normalCdf((highUnit * sessionSpins) / sessionRisk) : null;
  const winRateBand = outwardPercentBand(winRateLow, winRateHigh);
  const jackpotDenominator = num(machine.synthProb) > 0 ? num(machine.synthProb) : null;
  const initialAvgPayout = machine.allocationVerified === true && num(machine.hesoAvgPayout) > 0
    ? Math.round(num(machine.hesoAvgPayout))
    : null;
  const rushAvgPayout = machine.allocationVerified === true && num(machine.rushAvgPayout) > 0
    ? Math.round(num(machine.rushAvgPayout))
    : null;
  return {
    unitPrice: round(unitPrice),
    equivalentBorder: round(equivalentBorder),
    effectiveBorder: round(centerEconomics.effectiveBorder),
    economicAssumptions: {
      rentBalls: centerEconomics.rentBalls,
      exRate: centerEconomics.exRate,
      nonCashRatio: centerEconomics.nonCashRatio,
      cashRatio: centerEconomics.cashRatio,
    },
    hourly: Math.round(hourly),
    hourlyLow: lowUnit == null ? null : Math.round(lowUnit * params.spinsPerHour),
    hourlyHigh: highUnit == null ? null : Math.round(highUnit * params.spinsPerHour),
    daily: Math.round(daily),
    dailyLow: lowUnit == null ? null : Math.round(lowUnit * params.sessionSpins),
    dailyHigh: highUnit == null ? null : Math.round(highUnit * params.sessionSpins),
    hourlyRisk: hourlyRisk == null ? null : Math.round(hourlyRisk),
    dailyRisk: sessionRisk == null ? null : Math.round(sessionRisk),
    winRate,
    winRateLow,
    winRateHigh,
    winRateBandLow: winRateBand?.low ?? null,
    winRateBandHigh: winRateBand?.high ?? null,
    profitChanceStatus,
    profitChanceMethod: profitChanceStatus === "ready" ? "normal-approx-v1" : null,
    jackpotDenominator,
    jackpotLabel: jackpotDenominator ? `1/${round(jackpotDenominator, 1)}` : (machine.prob || null),
    atLeastOneHitRate: jackpotDenominator == null ? null : atLeastOneHitProbability(sessionSpins, jackpotDenominator),
    initialAvgPayout,
    rushAvgPayout,
    avgPayoutPerHit: num(machine.avgPayoutPerHit) > 0 ? Math.round(num(machine.avgPayoutPerHit)) : null,
    rushEntryRate: num(machine.rushEntryRate) > 0 ? num(machine.rushEntryRate) : null,
    rushContinueRate: num(machine.rushContinueRate) > 0 ? num(machine.rushContinueRate) : null,
    plannedSpins: sessionSpins,
    sharpe: hourlyRisk > 0 ? hourly / hourlyRisk : 0,
  };
}

function buildAIProfile(rows) {
  const valid = rows.filter((row) => row.valid);
  const aggregate = (list) => {
    const input = list.reduce((sum, row) => sum + row.estimatedInputBalls, 0);
    const spins = list.reduce((sum, row) => sum + row.estimate.normalSpins, 0);
    return { rate: input > 0 ? spins / (input / 250) : 0, count: list.length, inputBalls: input };
  };
  const overall = aggregate(valid);
  const groups = new Map();
  const add = (type, key, label, row) => {
    const id = `${type}___${key}`;
    if (!groups.has(id)) groups.set(id, { type, key, label, rows: [] });
    groups.get(id).rows.push(row);
  };
  for (const row of valid) {
    add("weekday", dayOfWeek(row.date), ["日", "月", "火", "水", "木", "金", "土"][dayOfWeek(row.date)], row);
    add("store", row.store, row.storeName || row.store, row);
    add("machine", row.machineName, row.machineName, row);
    add("island", islandKey(row), row.island || `${row.machineName}島`, row);
  }
  const profiles = [...groups.values()].map((group) => {
    const stat = aggregate(group.rows);
    const reliability = stat.inputBalls / (stat.inputBalls + 50000);
    const shrunkBias = (stat.rate - overall.rate) * reliability;
    return { ...group, ...stat, reliability, bias: shrunkBias };
  });
  return { overall, profiles };
}

function summarizeIslandActivity(key, rows, date = "") {
  const activeRows = rows.filter((row) => row.valid);
  const inactiveRows = rows.filter((row) => row.inactive || row.activityStatus === "inactive");
  const invalidRows = rows.filter((row) => !row.valid && !inactiveRows.includes(row));
  const totalInput = activeRows.reduce((sum, row) => sum + row.estimatedInputBalls, 0);
  const totalSpins = activeRows.reduce((sum, row) => sum + row.estimate.normalSpins, 0);
  const scannedMachines = rows.length;
  const inactiveRate = scannedMachines ? inactiveRows.length / scannedMachines : 0;
  const signalCode = inactiveRows.length > 0
    ? (inactiveRate >= 0.6 ? "inactive-high" : "inactive-partial")
    : invalidRows.length > 0 ? "invalid" : "active";
  return {
    key,
    date,
    store: rows[0]?.store || "",
    island: rows[0]?.island || `${rows[0]?.machineName || ""}島`,
    machineName: rows[0]?.machineName || "",
    averageRotation: totalInput > 0 ? totalSpins / (totalInput / 250) : 0,
    scannedMachines,
    activeMachines: activeRows.length,
    inactiveMachines: inactiveRows.length,
    invalidMachines: invalidRows.length,
    inactiveRate,
    signalCode,
    activitySignal: signalCode === "inactive-high"
      ? "島の未稼働が多い・調整前兆候補"
      : signalCode === "inactive-partial"
        ? "一部未稼働"
        : signalCode === "invalid" ? "読取除外あり" : "通常稼働",
  };
}

function buildIslandStats(latest) {
  const groups = new Map();
  for (const row of latest) {
    const key = islandKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, rows]) => summarizeIslandActivity(key, rows));
}

export function buildIslandActivityHistory(rows = []) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = dateKey(row?.date);
    if (!date) continue;
    const key = islandKey(row);
    const datedKey = `${date}___${key}`;
    if (!groups.has(datedKey)) groups.set(datedKey, { date, key, rows: [] });
    groups.get(datedKey).rows.push(row);
  }
  return [...groups.values()]
    .map((group) => summarizeIslandActivity(group.key, group.rows, group.date))
    .sort((left, right) => (
      dayNumber(left.date) - dayNumber(right.date)
      || left.key.localeCompare(right.key)
    ));
}

function applyDecision(latest, profiles, markov, spatial, opposite, params, biasCorrection = null) {
  void profiles;
  const biasEligible = new Set();
  const biasGroups = new Map();
  for (const row of latest.filter((item) => item.valid)) {
    const key = `${row.store}___${row.date}`;
    if (!biasGroups.has(key)) biasGroups.set(key, []);
    biasGroups.get(key).push(row);
  }
  for (const group of biasGroups.values()) {
    group.sort((left, right) => {
      const leftMargin = num(left.predictedRotation)
        - Math.max(0, num(params.lcbK, 1)) * Math.sqrt(Math.max(0, num(left.nextDayVariance)))
        - num(left.border);
      const rightMargin = num(right.predictedRotation)
        - Math.max(0, num(params.lcbK, 1)) * Math.sqrt(Math.max(0, num(right.nextDayVariance)))
        - num(right.border);
      return rightMargin - leftMargin || historyKey(left).localeCompare(historyKey(right));
    });
    group.slice(0, 5).forEach((row) => biasEligible.add(historyKey(row)));
  }
  return latest.map((row) => {
    if (!row.valid) {
      return {
        ...row,
        tightProbability: null,
        tightEvidence: {
          status: "unavailable",
          label: row.inactive ? "未稼働のため算定待ち" : "有効データ不足のため算定待ち",
          successes: 0,
          total: 0,
          minRequired: params.markovMinTransitions,
        },
        nailAlert: row.inactive ? "未稼働" : "データ除外",
        score: 0,
        verdict: "nodata",
      };
    }
    // tightProbability は「翌日に締められる確率」なので、曜日プロファイルも
    // 今日ではなく翌日の曜日（締めが起きる日）で参照する。
    const tomorrowDow = (dayOfWeek(row.date) + 1) % 7;
    const markovProfile = markov.byKey.get(profileKey(row)) || markov.global;
    const dowProfile = markovProfile?.weekdays?.[tomorrowDow];
    const stateGood = row.ema >= row.border + 0.5;
    const transitionTotal = stateGood
      ? num(markovProfile?.counts?.goodTotal)
      : num(markovProfile?.counts?.badTotal);
    const transitionTight = stateGood
      ? num(markovProfile?.counts?.goodTight)
      : num(markovProfile?.counts?.badTight);
    const usesObservedTransition = transitionTotal >= params.markovMinTransitions;
    const baseProbability = stateGood
      ? num(markovProfile?.goodToTight, 0.2)
      : num(markovProfile?.badToBad, 0.5);
    let tightProbability = baseProbability;
    const blendCondition = (current, conditionalRate, total) => {
      const reliability = Math.max(0, num(total)) / (Math.max(0, num(total)) + 8);
      return clamp(current * (1 - reliability) + num(conditionalRate, current) * reliability, 0, 1);
    };
    const openShock = row.changePoint === "open"
      || num(row.dailyRate) - num(row.priorEma, row.ema) >= 2;
    const openShockTotal = num(markovProfile?.counts?.openShockTotal);
    const openShockApplied = openShock && openShockTotal > 0;
    if (openShockApplied) {
      tightProbability = blendCondition(
        tightProbability,
        markovProfile.openShockNextTight,
        openShockTotal,
      );
    }
    const eventTotal = num(markovProfile?.counts?.eventTotal);
    const eventApplied = Boolean(row.event && eventTotal > 0);
    if (eventApplied) {
      tightProbability = blendCondition(
        tightProbability,
        markovProfile.eventNextTight,
        eventTotal,
      );
    }
    const weekdayApplied = num(dowProfile?.total) > 0;
    if (weekdayApplied) {
      tightProbability = blendCondition(
        tightProbability,
        dowProfile.rate,
        dowProfile.total,
      );
    }
    const tightEvidence = {
      status: usesObservedTransition ? "observed" : "prior",
      currentState: stateGood ? "good" : "bad",
      transitionLabel: stateGood ? "良→締" : "締→締",
      successes: transitionTight,
      total: transitionTotal,
      minRequired: params.markovMinTransitions,
      baseProbability,
      weekday: {
        successes: num(dowProfile?.tight),
        total: num(dowProfile?.total),
        applied: weekdayApplied,
      },
      openShock: {
        detected: openShock,
        successes: num(markovProfile?.counts?.openShockTight),
        total: openShockTotal,
        applied: openShockApplied,
      },
      event: {
        successes: num(markovProfile?.counts?.eventTight),
        total: eventTotal,
        applied: eventApplied,
      },
    };

    // Forecast the next day as a mixture of "held" and "tightened" states.
    // The between-state term p(1-p)(mu_hold-mu_tight)^2 is retained in the
    // interval so the mean adjustment never creates false precision.
    const heldRotation = num(row.predictedRotation);
    const historicalTightRotation = Math.max(
      0,
      row.border + num(markovProfile?.tightResidual, -1),
    );
    const tightenedRotation = Math.min(heldRotation, historicalTightRotation);
    const transitionMean = (
      (1 - tightProbability) * heldRotation
      + tightProbability * tightenedRotation
    );
    const transitionVariance = tightProbability * (1 - tightProbability)
      * ((heldRotation - tightenedRotation) ** 2);
    const biasRotationAdjustment = biasCorrection?.appliesAutomatically === true
      && biasEligible.has(historyKey(row))
      ? num(biasCorrection.appliedRotationAdjustment)
      : 0;
    const adjustedRotation = Math.max(0, transitionMean + biasRotationAdjustment);
    const nextDayVariance = Math.max(0, num(row.nextDayVariance ?? row.posteriorVariance))
      + transitionVariance;
    const predictiveSd = Math.sqrt(nextDayVariance);
    const transitionReliability = DEFAULT_PRIOR_VARIANCE / (
      DEFAULT_PRIOR_VARIANCE + transitionVariance
    );
    // The displayed confidence represents data + overnight process
    // reliability. Transition uncertainty is already carried by
    // nextDayVariance and therefore affects the LCB/range, not confidence a
    // second time.
    const forecastConfidence = clamp(num(row.confidence), 0, 0.99);
    const forecastRow = {
      ...row,
      confidence: forecastConfidence,
      forecastConfidence,
      predictedRotation: adjustedRotation,
      predictedLow: Math.max(0, adjustedRotation - 1.96 * predictiveSd),
      predictedHigh: adjustedRotation + 1.96 * predictiveSd,
      nextDayVariance,
    };

    const spatialInfo = spatial.get(historyKey(row)) || { code: "none", label: "隣接情報なし" };
    const oppositeInfo = opposite.get(historyKey(row)) || { code: "none", label: "対面情報なし" };
    const tightSpatial = spatialInfo.code.includes("tight");
    const openSpatial = spatialInfo.code.includes("open");
    const tightOpposite = oppositeInfo.code.includes("tight");
    const openOpposite = oppositeInfo.code.includes("open");
    const change = row.changePoint;
    const regimeAgeDays = dayNumber(row.date) - dayNumber(row.regimeStart);

    let nailAlert = "ニュートラル";
    if (row.cumulativeInputBalls < 10000) nailAlert = "蓄積待ち";
    else if (change === "tight" && tightSpatial && tightOpposite) nailAlert = "3重締め検知";
    else if (change === "open" && openSpatial && openOpposite) nailAlert = "3重開け検知";
    else if (change === "tight") nailAlert = "締め変化を検知";
    else if (change === "open") nailAlert = "開け変化を検知";
    else if (row.regimeDirection === "tight" && regimeAgeDays <= 7) nailAlert = "締め状態が継続";
    else if (row.regimeDirection === "open" && regimeAgeDays <= 7) nailAlert = "開け状態が継続";
    else if (tightSpatial || tightOpposite) nailAlert = tightSpatial ? spatialInfo.label : oppositeInfo.label;
    else if (openSpatial || openOpposite) nailAlert = openSpatial ? spatialInfo.label : oppositeInfo.label;
    else if (row.cusumDown >= row.cusumThreshold * 0.6) nailAlert = "締め傾向";
    else if (row.cusumUp >= row.cusumThreshold * 0.6) nailAlert = "開け傾向";

    const finance = economics(forecastRow, params);
    const borderDifference = forecastRow.predictedRotation - finance.effectiveBorder;
    const baseScore = borderDifference * forecastRow.confidence * 100;
    // Tight/event effects already changed the forecast mean above. Keeping
    // them out of this point adjustment prevents a double or triple penalty.
    let contextAdjustment = 0;
    if (openSpatial || openOpposite) contextAdjustment += 6;
    if (tightSpatial || tightOpposite) contextAdjustment -= 6;
    contextAdjustment = clamp(contextAdjustment, -15, 15);
    const score = Math.max(0, baseScore + contextAdjustment);
    const verdict = classifyEvidenceScore(score, forecastRow.confidence);
    const lcbK = Math.max(0, num(params.lcbK, 1));
    const lcbRotation = forecastRow.predictedRotation - lcbK * predictiveSd;
    const selectionMargin = lcbRotation - finance.effectiveBorder;
    return {
      ...forecastRow,
      spatial: spatialInfo,
      opposite: oppositeInfo,
      tightProbability,
      tightEvidence,
      heldRotation,
      tightenedRotation,
      tightMeanAdjustment: transitionMean - heldRotation,
      transitionVariance,
      transitionReliability,
      biasRotationAdjustment,
      biasCorrectionStatus: biasCorrection?.status || "awaiting-samples",
      weekdayTightRate: dowProfile?.rate || 0,
      weekdaySampleCount: dowProfile?.total || 0,
      nailAlert,
      borderDifference,
      lcbK,
      lcbRotation,
      selectionMargin,
      contextAdjustment,
      score,
      verdict,
      ...finance,
      action: nailAlert.includes("締め") ? "見送り・撤退を優先" : verdict === "strong" ? "最優先候補" : verdict === "watch" ? "実測を見て判断" : "見送り",
    };
  });
}

function buildRollingDecisionRows(baseRows, islands, params) {
  const dates = [...new Set(baseRows.map((row) => row.date).filter(Boolean))]
    .sort((left, right) => dayNumber(left) - dayNumber(right));
  const basePairs = buildBacktestPairs(baseRows);
  const decisions = [];
  let finalProcessNoise = estimateProcessNoise([], params);

  for (const date of dates) {
    const currentDay = dayNumber(date);
    const knownRows = baseRows.filter((row) => dayNumber(row.date) <= currentDay);
    const currentBaseRows = baseRows.filter((row) => row.date === date);
    const knownProcessPairs = basePairs.filter(
      (pair) => dayNumber(pair.actualDate) <= currentDay,
    );
    const processNoise = estimateProcessNoise(knownProcessPairs, params);
    finalProcessNoise = processNoise;
    const predictiveRows = applyProcessNoise(currentBaseRows, processNoise, params);

    // Appending today's base rows exposes today's actual dailyRate to the
    // previous day's forecast pair, while today's own forecast is not yet part
    // of the bias history. This is the rolling-origin boundary.
    const priorBacktest = buildPEvidenceBacktest(
      [...decisions, ...currentBaseRows],
      params,
    );
    const profiles = buildStoreProfiles(knownRows);
    const markov = buildMarkov(knownRows, params);
    const spatial = buildSpatial(predictiveRows, params);
    const opposite = buildOpposite(predictiveRows, islands);
    decisions.push(...applyDecision(
      predictiveRows,
      profiles,
      markov,
      spatial,
      opposite,
      params,
      priorBacktest.biasCorrection,
    ));
  }

  return {
    rows: decisions,
    processNoise: finalProcessNoise,
    backtest: buildPEvidenceBacktest(decisions, params),
    method: "rolling-origin-day-by-day-v1",
  };
}

function tightProbabilityOf(row) {
  if (row?.tightProbability != null && row.tightProbability !== "" && Number.isFinite(Number(row.tightProbability))) {
    return clamp(Number(row.tightProbability), 0, 1);
  }
  if (row?.tomorrowTight != null && row.tomorrowTight !== "" && Number.isFinite(Number(row.tomorrowTight))) {
    return clamp(Number(row.tomorrowTight) / 100, 0, 1);
  }
  return null;
}

export function priorityScoreOf(row) {
  const baseScore = num(row?.score ?? row?.goodMachineScore);
  const predictedRotation = Number(
    row?.predictedRotation
    ?? row?.rot
    ?? row?.rotationEstimate?.mean,
  );
  const variance = Number(
    row?.nextDayVariance
    ?? row?.rotationEstimate?.variance
    ?? row?.posteriorVariance,
  );
  const border = Number(row?.effectiveBorder ?? row?.border);
  const lcbK = Math.max(0, num(row?.lcbK, 1));
  if (
    Number.isFinite(predictedRotation)
    && Number.isFinite(variance)
    && variance >= 0
    && Number.isFinite(border)
  ) {
    return predictedRotation - lcbK * Math.sqrt(variance) - border;
  }
  return baseScore;
}

export function rankStrategyCandidates(rows = []) {
  return [...rows].sort((a, b) =>
    priorityScoreOf(b) - priorityScoreOf(a)
    || num(b?.score ?? b?.goodMachineScore) - num(a?.score ?? a?.goodMachineScore)
    || num(b?.confidence) - num(a?.confidence)
    || String(a?.machineName || "").localeCompare(String(b?.machineName || ""))
    || num(a?.num ?? a?.number) - num(b?.num ?? b?.number)
  );
}

export function buildPortfolioPlan(rows = [], options = {}) {
  const plannedHours = Math.max(0, num(options.plannedHours ?? options.portfolioHours, 6));
  const maxCandidates = Math.max(1, Math.round(num(options.maxCandidates, 10)));
  const hasExplicitTightGate = Number.isFinite(Number(options.maxTightProbability));
  const maxTightProbability = hasExplicitTightGate
    ? clamp(Number(options.maxTightProbability), 0, 1)
    : 1;
  const candidates = rankStrategyCandidates(rows.filter((row) => {
    const hourly = num(row?.hourly ?? row?.evPerHour);
    const hourlyRisk = num(row?.hourlyRisk);
    const tightProbability = tightProbabilityOf(row);
    const valid = row?.valid !== false
      && row?.actionable !== false
      && row?.recommendationStatus !== "reference";
    return valid
      && hourly > 0
      && hourlyRisk > 0
      && num(row?.sharpe) > 0
      && (row?.verdict === "strong" || row?.verdict === "watch")
      && !String(row?.nailAlert || "").includes("締め")
      && (!hasExplicitTightGate || tightProbability == null || tightProbability < maxTightProbability);
  })).slice(0, maxCandidates);
  if (!(plannedHours > 0) || !candidates.length) {
    return { plan: [], totalHours: 0, expectedProfit: 0, projectedCash: 0 };
  }

  const totalSharpe = candidates.reduce((sum, row) => sum + Math.max(0, num(row.sharpe)), 0);
  const weights = candidates.map((row) =>
    totalSharpe > 0 ? Math.max(0, num(row.sharpe)) / totalSharpe : 1 / candidates.length
  );
  const rentBalls = Math.max(1, num(options.rentBalls, 250));
  const nonCashRatio = clamp(num(options.nonCashRatio), 0, 1);
  const cashRatio = 1 - nonCashRatio;
  const spinsPerHour = Math.max(0, num(options.spinsPerHour, 210));
  const cashBurnPerHour = candidates.map((row) => {
    const rotation = num(row?.predictedRotation ?? row?.rot);
    return rotation > 0
      ? (spinsPerHour / rotation) * (250 / rentBalls) * 1000 * cashRatio
      : 0;
  });
  const cashLimit = Math.max(0, num(options.cashLimit));
  const rawHours = weights.map((weight) => plannedHours * weight);
  const rawCash = rawHours.reduce((sum, hours, index) => sum + hours * cashBurnPerHour[index], 0);
  const cashScale = cashLimit > 0 && rawCash > cashLimit ? cashLimit / rawCash : 1;
  const targetTenths = rawHours.map((hours) => hours * cashScale * 10);
  const allocatedTenths = targetTenths.map(Math.floor);
  let remainingTenths = Math.max(
    0,
    Math.floor(plannedHours * 10 + 1e-9) - allocatedTenths.reduce((sum, value) => sum + value, 0),
  );
  let projectedCash = allocatedTenths.reduce(
    (sum, tenths, index) => sum + tenths / 10 * cashBurnPerHour[index],
    0,
  );
  const remainderOrder = [...targetTenths.keys()].sort((a, b) =>
    (targetTenths[b] - allocatedTenths[b]) - (targetTenths[a] - allocatedTenths[a])
    || priorityScoreOf(candidates[b]) - priorityScoreOf(candidates[a])
  );
  while (remainingTenths > 0) {
    let assigned = false;
    for (const index of remainderOrder) {
      const nextCash = projectedCash + cashBurnPerHour[index] / 10;
      if (cashLimit > 0 && nextCash > cashLimit + 1e-9) continue;
      allocatedTenths[index] += 1;
      projectedCash = nextCash;
      remainingTenths -= 1;
      assigned = true;
      if (remainingTenths <= 0) break;
    }
    if (!assigned) break;
  }
  let cumulativeExpectedProfit = 0;
  const plan = candidates.map((row, index) => {
    const hours = allocatedTenths[index] / 10;
    if (!(hours > 0)) return null;
    const hourly = num(row?.hourly ?? row?.evPerHour);
    const expectedProfit = Math.round(hourly * hours);
    cumulativeExpectedProfit += expectedProfit;
    return {
      rank: 0,
      number: row?.num ?? row?.number,
      machineName: row?.machineName || "",
      store: row?.store ?? row?.storeId ?? row?.storeName ?? "",
      predictedRotation: num(row?.predictedRotation ?? row?.rot),
      hourly,
      hours,
      expectedProfit,
      cumulativeExpectedProfit,
      projectedCash: Math.round(hours * cashBurnPerHour[index]),
      risk: Math.round(num(row?.hourlyRisk) * Math.sqrt(hours)),
      sharpe: num(row?.sharpe),
      priorityScore: round(priorityScoreOf(row)),
      action: "",
    };
  }).filter(Boolean).map((item, index) => ({
    ...item,
    rank: index + 1,
    action: index === 0 ? "最優先" : item.hours >= 1.5 ? "巡回候補" : "予備候補",
  }));
  return {
    plan,
    totalHours: round(plan.reduce((sum, item) => sum + item.hours, 0), 1),
    expectedProfit: cumulativeExpectedProfit,
    projectedCash: Math.round(plan.reduce((sum, item) => sum + item.projectedCash, 0)),
  };
}

function buildNextMap(rows) {
  return rows.map((row) => {
    // strong 判定の台に「回収寄り」を出す矛盾を避け、締め確率が中間帯なら様子見に落とす。
    let prediction = "回収寄り";
    if (row.tightProbability >= 0.6) prediction = "明日締め注意";
    else if (row.verdict === "strong" && row.tightProbability < 0.4) prediction = "据え置き有力";
    else if (row.spatial?.code.includes("open") || row.opposite?.code.includes("open")) prediction = "開け波及候補";
    else if (row.verdict === "strong" || row.verdict === "watch") prediction = "様子見";
    return { number: row.num, machineName: row.machineName, island: row.island, store: row.store, prediction, probability: row.tightProbability };
  });
}

export function buildPEvidenceAnalytics({
  scans = [],
  customMachines = [],
  islands = [],
  payoutCorrections = [],
  params: overrides = {},
} = {}) {
  const params = { ...PE_PARAMS, ...overrides };
  const statusSourceRows = latestRows(scans, { includeInvalid: true });
  const rawRows = statusSourceRows.filter((row) => hasUsableDeltaValue(row) && !row.dateInvalid);
  const baseProcessed = createProcessedRows(
    statusSourceRows,
    customMachines,
    params,
    payoutCorrections,
  );
  const rolling = buildRollingDecisionRows(baseProcessed, islands, params);
  const processNoise = rolling.processNoise;
  const processed = applyProcessNoise(baseProcessed, processNoise, params);
  const backtest = rolling.backtest;
  const storeProfiles = buildStoreProfiles(processed);
  const markov = buildMarkov(processed, params);
  const decisionRows = latestByHistory(rolling.rows);
  const aiProfile = buildAIProfile(processed);
  // 「今日の配分」「明日の地図」は最新スキャン日のデータがある台だけを対象にし、
  // 数日前が最終データの台の古い予測を今日の推奨として出さない。
  // 全台未稼働の日も「最新日」として扱い、前日の候補を復活させない。
  const scanDays = statusSourceRows.map((row) => dayNumber(row.date)).filter(Number.isFinite);
  const currentDay = scanDays.length ? Math.max(...scanDays) : NaN;
  const currentRows = Number.isFinite(currentDay)
    ? decisionRows.filter((row) => dayNumber(row.date) === currentDay)
    : [];
  const islandStats = buildIslandStats(currentRows);
  const islandActivityHistory = buildIslandActivityHistory(processed);
  const portfolio = buildPortfolioPlan(currentRows, {
    plannedHours: params.portfolioHours,
    cashLimit: params.cashLimit,
    spinsPerHour: params.spinsPerHour,
    rentBalls: params.rentBalls,
    nonCashRatio: params.nonCashRatio,
  });
  const nextMap = buildNextMap(currentRows.filter((row) => row.valid));
  return {
    params,
    rawRowCount: rawRows.length,
    historyRows: processed,
    latestRows: decisionRows.filter(hasUsableDeltaValue),
    statusRows: decisionRows,
    currentRows,
    storeProfiles,
    markovProfiles: markov.profiles,
    processNoise,
    backtestMethod: rolling.method,
    payoutCorrections,
    aiProfile,
    backtest,
    islandStats,
    islandActivityHistory,
    portfolio,
    nextMap,
  };
}

export const pevidenceInternals = {
  dateKey,
  dayOfWeek,
  estimateDaily,
  buildOppositePairs,
  normalCdf,
  atLeastOneHitProbability,
  outwardPercentBand,
  hasExactMachineIdentity,
};
