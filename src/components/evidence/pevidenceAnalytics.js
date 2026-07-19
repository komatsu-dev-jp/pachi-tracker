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
  findMachineSpec,
  machineBorder,
  resolveMachineStats,
} from "../delta/deltaEvidence.js";

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
  portfolioHours: 8,
  spinsPerHour: 210,
  sessionSpins: 2200,
  riskReferenceSpins: 2200,
  priorHalfLifeBalls: 7000,
  defaultPriorBalls: 50000,
  graphStepBalls: 500,
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
  if (!value) return "";
  const text = String(value).trim().replaceAll("/", "-");
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayNumber(value) {
  const key = dateKey(value);
  if (!key) return NaN;
  const [y, m, d] = key.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
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
  return Boolean(status) && !["正常", "ok", "OK", "有効"].includes(status);
}

function latestRows(scans = []) {
  const map = new Map();
  for (const scan of scans || []) {
    for (const row of scan?.rows || []) {
      const date = dateKey(row?.date || scan?.date);
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
  const deltaBalls = num(row.val);
  const border = machineBorder(machine);
  const stats = resolveMachineStats(machine);
  if (!(normalSpins > 0) || !(border > 0) || hasExplicitError(row)) {
    return { valid: false, normalSpins, totalStarts, deltaBalls, border, stats };
  }
  // 平均出玉が不明なのに大当りがある日は、投入玉を推定できず
  // 回転率が2倍側へ張り付くため除外する（deltaEvidence と同じ基準）。
  if (totalStarts > 0 && !(stats.avgPayout > 0)) {
    return { valid: false, reason: "平均出玉なし", normalSpins, totalStarts, deltaBalls, border, stats };
  }

  let payoutEstimate = 250;
  let payoutWeight = clamp(totalStarts / 10, 0, 1);
  if (stats.avgPayout > 0 && totalStarts > 0) {
    payoutEstimate = Math.max(250, totalStarts * stats.avgPayout - deltaBalls);
  } else if (totalStarts === 0 && deltaBalls < 0) {
    // 当りゼロの日は差玉≒投入玉そのもの（最も正確な実測）なので全面的に採用する。
    payoutEstimate = Math.max(250, Math.abs(deltaBalls));
    payoutWeight = 1;
  }

  const spinEstimate = Math.max(250, normalSpins / border * 250);
  const blended = payoutEstimate * payoutWeight + spinEstimate * (1 - payoutWeight);
  const estimatedInputBalls = clamp(blended, spinEstimate * 0.5, spinEstimate * 3);
  const dailyRate = normalSpins / (estimatedInputBalls / 250);
  if (!(dailyRate >= 5 && dailyRate <= 45)) {
    return { valid: false, reason: "回転率が現実範囲外", normalSpins, totalStarts, deltaBalls, border, stats };
  }

  const payoutVariance = totalStarts * (stats.stdDev * 0.25) ** 2;
  const graphVariance = params.graphStepBalls ** 2 / 12;
  const derivative = 250 * normalSpins / estimatedInputBalls ** 2;
  const dailyStandardError = Math.max(0.15, derivative * Math.sqrt(payoutVariance + graphVariance));
  return {
    valid: true,
    normalSpins,
    totalStarts,
    deltaBalls,
    border,
    stats,
    payoutEstimate,
    spinEstimate,
    payoutWeight,
    estimatedInputBalls,
    dailyRate,
    dailyStandardError,
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

function createProcessedRows(rawRows, customMachines, params) {
  const grouped = new Map();
  for (const raw of rawRows) {
    const machine = findMachineSpec(raw.machineName, customMachines, machineDB);
    if (!machine) continue;
    const estimate = estimateDaily(raw, machine, params);
    const row = { ...raw, machine, estimate, border: machineBorder(machine) };
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

    for (const row of list) {
      const e = row.estimate;
      if (!e.valid) {
        output.push({ ...row, valid: false, ema: ema ?? row.border, cusumUp, cusumDown });
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
      const priorBalls = Math.max(2500, num(row.machine?.muraCoef, params.defaultPriorBalls) * Math.pow(0.5, confidenceBalls / params.priorHalfLifeBalls));
      const confidence = confidenceSamples / (confidenceSamples + priorBalls / 250);
      const predictedRotation = activeRate * confidence + row.border * (1 - confidence);
      const aggregateDerivative = 250 * cumulativeSpins / Math.max(1, cumulativeInputBalls ** 2);
      const standardError = Math.max(0.12, aggregateDerivative * Math.sqrt(Math.max(0, cumulativeInputVariance)));
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
        cusumUp,
        cusumDown,
        cusumThreshold: threshold,
        changePoint,
        regimeStart,
        regimeDirection,
        regimeSpins,
        regimeInputBalls,
        regimeRate,
        confidence,
        predictedRotation,
        predictedLow,
        predictedHigh,
        standardError,
      });
    }
  }
  return output.sort((a, b) => dayNumber(a.date) - dayNumber(b.date));
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
  return total > 0 ? (successes + 1) / (total + 2) : fallback;
}

function buildMarkov(rows, params) {
  const histories = new Map();
  for (const row of rows.filter((item) => item.valid)) {
    const key = historyKey(row);
    if (!histories.has(key)) histories.set(key, []);
    histories.get(key).push(row);
  }
  const summaries = new Map();
  for (const history of histories.values()) {
    history.sort((a, b) => dayNumber(a.date) - dayNumber(b.date));
    const pKey = profileKey(history[0]);
    if (!summaries.has(pKey)) summaries.set(pKey, { AA: 0, AB: 0, BA: 0, BB: 0, eventTight: 0, eventTotal: 0, streakTight: 0, streakTotal: 0 });
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
      const state = current.ema >= current.border + 0.5 ? "A" : "B";
      summary[prevState + state] += 1;
      if (prev.event) {
        summary.eventTotal += 1;
        if (prevState === "A" && state === "B") summary.eventTight += 1;
      }
      streak = prevState === "A" ? streak + 1 : 0;
      if (streak >= 3) {
        summary.streakTotal += 1;
        if (state === "B") summary.streakTight += 1;
      }
    }
  }

  const profiles = [...summaries.entries()].map(([key, s]) => {
    const [store, machineName] = key.split("___");
    const totalA = s.AA + s.AB;
    const totalB = s.BA + s.BB;
    return {
      key,
      store,
      machineName,
      counts: s,
      goodToGood: betaRate(s.AA, totalA, 0.8),
      goodToTight: betaRate(s.AB, totalA, 0.2),
      badToGood: betaRate(s.BA, totalB, 0.5),
      badToBad: betaRate(s.BB, totalB, 0.5),
      eventNextTight: betaRate(s.eventTight, s.eventTotal, 0.2),
      streak3NextTight: betaRate(s.streakTight, s.streakTotal, 0.2),
      enoughGood: totalA >= params.markovMinTransitions,
      enoughBad: totalB >= params.markovMinTransitions,
    };
  });
  return { profiles, byKey: new Map(profiles.map((item) => [item.key, item])) };
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
  for (let i = 0; i + 1 < islands.length; i += 2) {
    const left = islands[i];
    const right = islands[i + 1];
    const aStart = num(left?.start, NaN);
    const aEnd = num(left?.end, NaN);
    const bStart = num(right?.start, NaN);
    const bEnd = num(right?.end, NaN);
    if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) continue;
    const a = [];
    const b = [];
    for (let n = Math.min(aStart, aEnd); n <= Math.max(aStart, aEnd); n++) a.push(String(n));
    for (let n = Math.min(bStart, bEnd); n <= Math.max(bStart, bEnd); n++) b.push(String(n));
    if (a.length !== b.length) continue;
    for (let j = 0; j < a.length; j++) {
      pairs.set(a[j], b[b.length - 1 - j]);
      pairs.set(b[b.length - 1 - j], a[j]);
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
  const border = row.border;
  const unitPrice = rotation > 0 && border > 0 ? 1000 / border - 1000 / rotation : 0;
  const hourly = unitPrice * params.spinsPerHour;
  const daily = unitPrice * params.sessionSpins;
  const lowUnit = row.predictedLow > 0 ? 1000 / border - 1000 / row.predictedLow : 0;
  const highUnit = row.predictedHigh > 0 ? 1000 / border - 1000 / row.predictedHigh : 0;
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
    hourly: Math.round(hourly),
    hourlyLow: Math.round(lowUnit * params.spinsPerHour),
    hourlyHigh: Math.round(highUnit * params.spinsPerHour),
    daily: Math.round(daily),
    dailyLow: Math.round(lowUnit * params.sessionSpins),
    dailyHigh: Math.round(highUnit * params.sessionSpins),
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

function buildIslandStats(latest) {
  const groups = new Map();
  for (const row of latest.filter((item) => item.valid)) {
    const key = islandKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const totalInput = rows.reduce((sum, row) => sum + row.estimatedInputBalls, 0);
    const totalSpins = rows.reduce((sum, row) => sum + row.estimate.normalSpins, 0);
    return {
      key,
      store: rows[0]?.store || "",
      island: rows[0]?.island || `${rows[0]?.machineName || ""}島`,
      machineName: rows[0]?.machineName || "",
      averageRotation: totalInput > 0 ? totalSpins / (totalInput / 250) : 0,
      activeMachines: rows.length,
    };
  });
}

function applyDecision(latest, profiles, markov, spatial, opposite, params) {
  const profileMap = new Map(profiles.map((item) => [item.key, item]));
  return latest.map((row) => {
    if (!row.valid) return { ...row, nailAlert: "データ除外", score: 0, verdict: "nodata" };
    const profile = profileMap.get(profileKey(row));
    // tightProbability は「翌日に締められる確率」なので、曜日プロファイルも
    // 今日ではなく翌日の曜日（締めが起きる日）で参照する。
    const tomorrowDow = (dayOfWeek(row.date) + 1) % 7;
    const dowProfile = profile?.days?.[tomorrowDow];
    const markovProfile = markov.byKey.get(profileKey(row));
    const stateGood = row.ema >= row.border + 0.5;
    const totalA = markovProfile ? markovProfile.counts.AA + markovProfile.counts.AB : 0;
    const totalB = markovProfile ? markovProfile.counts.BA + markovProfile.counts.BB : 0;
    let tightProbability = stateGood
      ? (totalA >= params.markovMinTransitions ? markovProfile.goodToTight : 0.2)
      : (totalB >= params.markovMinTransitions ? markovProfile.badToBad : 0.5);
    if (row.event && markovProfile?.counts.eventTotal >= 3) tightProbability = Math.max(tightProbability, markovProfile.eventNextTight * 0.8);
    // 「現在が日曜」だけが翌日=月曜。元GASの土曜補正は適用しない。
    if (dayOfWeek(row.date) === 0) tightProbability = Math.min(1, tightProbability * 1.2);
    if (dowProfile?.enough) tightProbability = clamp(tightProbability * 0.75 + dowProfile.rate * 0.25, 0, 1);

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

    const borderDifference = row.predictedRotation - row.border;
    const baseScore = borderDifference * row.confidence * 100;
    // 空間・対面・曜日・マルコフは同じ現象を重ねて見るため、合計補正を±15点に制限する。
    let contextAdjustment = 0;
    if (openSpatial || openOpposite) contextAdjustment += 6;
    if (tightSpatial || tightOpposite) contextAdjustment -= 6;
    if (tightProbability >= 0.6 && borderDifference > 0) contextAdjustment -= 8;
    if (row.event && borderDifference > 0) contextAdjustment += 3;
    contextAdjustment = clamp(contextAdjustment, -15, 15);
    const score = Math.max(0, baseScore + contextAdjustment);
    const verdict = row.confidence < 0.2 ? "nodata" : score >= 50 ? "strong" : score >= 10 ? "watch" : "weak";
    const finance = economics(row, params);
    return {
      ...row,
      spatial: spatialInfo,
      opposite: oppositeInfo,
      tightProbability,
      weekdayTightRate: dowProfile?.rate || 0,
      weekdaySampleCount: dowProfile?.total || 0,
      nailAlert,
      borderDifference,
      contextAdjustment,
      score,
      verdict,
      ...finance,
      action: nailAlert.includes("締め") ? "見送り・撤退を優先" : verdict === "strong" ? "最優先候補" : verdict === "watch" ? "実測を見て判断" : "見送り",
    };
  });
}

function buildPortfolio(rows, params) {
  // 信頼度不足（nodata）の台を時間配分へ推奨しない。strong / watch のみ対象。
  const candidates = rows
    .filter((row) => row.valid && row.hourly > 0 && row.hourlyRisk > 0 && (row.verdict === "strong" || row.verdict === "watch") && !row.nailAlert.includes("締め"))
    .sort((a, b) => b.sharpe - a.sharpe)
    .slice(0, 10);
  const totalSharpe = candidates.reduce((sum, row) => sum + Math.max(0, row.sharpe), 0);
  let cumulativeExpectedProfit = 0;
  const plan = candidates.map((row, index) => {
    const weight = totalSharpe > 0 ? Math.max(0, row.sharpe) / totalSharpe : 1 / candidates.length;
    const hours = round(params.portfolioHours * weight, 1);
    const expectedProfit = Math.round(row.hourly * hours);
    cumulativeExpectedProfit += expectedProfit;
    return {
      rank: index + 1,
      number: row.num,
      machineName: row.machineName,
      predictedRotation: row.predictedRotation,
      hourly: row.hourly,
      hours,
      expectedProfit,
      cumulativeExpectedProfit,
      risk: Math.round(row.hourlyRisk * Math.sqrt(Math.max(0, hours))),
      sharpe: row.sharpe,
      action: index === 0 ? "最優先" : hours >= 1.5 ? "巡回候補" : "予備候補",
    };
  });
  return { plan, totalHours: round(plan.reduce((sum, item) => sum + item.hours, 0), 1), expectedProfit: cumulativeExpectedProfit };
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

export function buildPEvidenceAnalytics({ scans = [], customMachines = [], islands = [], params: overrides = {} } = {}) {
  const params = { ...PE_PARAMS, ...overrides };
  const rawRows = latestRows(scans);
  const processed = createProcessedRows(rawRows, customMachines, params);
  const storeProfiles = buildStoreProfiles(processed);
  const markov = buildMarkov(processed, params);
  const latest = latestByHistory(processed);
  const spatial = buildSpatial(latest, params);
  const opposite = buildOpposite(latest, islands);
  const decisionRows = applyDecision(latest, storeProfiles, markov, spatial, opposite, params);
  const aiProfile = buildAIProfile(processed);
  const islandStats = buildIslandStats(latest);
  // 「今日の配分」「明日の地図」は最新スキャン日のデータがある台だけを対象にし、
  // 数日前が最終データの台の古い予測を今日の推奨として出さない。
  const validDays = decisionRows.filter((row) => row.valid).map((row) => dayNumber(row.date));
  const currentDay = validDays.length ? Math.max(...validDays) : NaN;
  const currentRows = Number.isFinite(currentDay)
    ? decisionRows.filter((row) => dayNumber(row.date) === currentDay)
    : [];
  const portfolio = buildPortfolio(currentRows, params);
  const nextMap = buildNextMap(currentRows);
  return {
    params,
    rawRowCount: rawRows.length,
    historyRows: processed,
    latestRows: decisionRows,
    storeProfiles,
    markovProfiles: markov.profiles,
    aiProfile,
    islandStats,
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
