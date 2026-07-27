import { evidenceDayNumber, normalizeEvidenceDate } from "../../evidenceDate.js";

export const PE_BACKTEST_DEFAULTS = Object.freeze({
  minCalibrationSamples: 20,
  calibrationStepBalls: 2500,
  minPriorBalls: 2500,
  maxPriorBalls: 500000,
  minProcessSamples: 12,
  processShrinkageSamples: 20,
  defaultProcessNoiseSd: 1.75,
  minProcessNoiseSd: 1.5,
  maxProcessNoiseSd: 5,
  selectionBiasMinSamples: 20,
  selectionBiasValidationWarmup: 10,
  selectionBiasPriorSamples: 20,
  selectionBiasMax: 3,
  lcbK: 1,
});

function finite(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function dateKey(value) {
  return normalizeEvidenceDate(value);
}

function dayNumber(value) {
  const day = evidenceDayNumber(value);
  return Number.isFinite(day) ? day : null;
}

function rowIdentity(row) {
  const store = String(row?.store ?? row?.storeId ?? row?.storeName ?? "").trim();
  const machineName = String(row?.machineName ?? "").trim();
  const num = String(row?.num ?? "").trim();
  if (!store || !machineName || !num) return null;
  return {
    store,
    machineName,
    num,
    key: `${store}___${machineName}___${num}`,
  };
}

function isValidRow(row) {
  return row?.valid === true && finite(row?.dailyRate) !== null;
}

function forecastFrom(row) {
  const predictedRotation = finite(row?.predictedRotation);
  const predictedLow = finite(row?.predictedLow);
  const predictedHigh = finite(row?.predictedHigh);
  if (
    predictedRotation === null
    || predictedLow === null
    || predictedHigh === null
    || predictedLow > predictedHigh
  ) return null;
  const intervalSd = (predictedHigh - predictedLow) / (2 * 1.96);
  const forecastVariance = finite(row?.nextDayVariance ?? row?.posteriorVariance);
  return {
    predictedRotation,
    predictedLow,
    predictedHigh,
    forecastVariance: forecastVariance !== null && forecastVariance >= 0
      ? forecastVariance
      : Math.max(0, intervalSd ** 2),
  };
}

function forecastVerdict(score, confidence) {
  if (confidence < 0.2) return "nodata";
  if (score >= 50) return "strong";
  if (score >= 10) return "watch";
  return "weak";
}

function scoreBand(score, confidence) {
  if (confidence < 0.2) return "nodata";
  if (score >= 50) return "50+";
  if (score >= 10) return "10-49";
  return "0-9";
}

function annotateSelectionRanks(pairs, lcbK) {
  const groups = new Map();
  for (const pair of pairs) {
    const key = `${pair.store}___${pair.predictionDate}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pair);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => (
      right.selectionMargin - left.selectionMargin
      || right.forecastScore - left.forecastScore
      || right.confidence - left.confidence
      || String(left.machineName).localeCompare(String(right.machineName))
      || String(left.num).localeCompare(String(right.num))
    ));
    group.forEach((pair, index) => {
      pair.selectionRank = index + 1;
      pair.recommendedTop5 = index < 5;
      pair.lcbK = lcbK;
    });
  }
}

/**
 * Processed P-EVIDENCE rows are paired without recomputing their predictions.
 *
 * A date is deliberately discarded when the same store/machine/number has more
 * than one row for that date. Picking either duplicate would make the result
 * depend on input order and could silently introduce look-ahead changes.
 */
export function buildBacktestPairs(rows = []) {
  const byIdentityAndDate = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const identity = rowIdentity(row);
    const date = dateKey(row?.date);
    if (!identity || !date) continue;
    const bucketKey = `${identity.key}___${date}`;
    const bucket = byIdentityAndDate.get(bucketKey);
    if (bucket) {
      bucket.rows.push(row);
    } else {
      byIdentityAndDate.set(bucketKey, {
        ...identity,
        date,
        day: dayNumber(date),
        rows: [row],
      });
    }
  }

  const histories = new Map();
  for (const bucket of byIdentityAndDate.values()) {
    if (bucket.rows.length !== 1) continue;
    const row = bucket.rows[0];
    if (!isValidRow(row)) continue;
    if (!histories.has(bucket.key)) {
      histories.set(bucket.key, {
        key: bucket.key,
        store: bucket.store,
        machineName: bucket.machineName,
        num: bucket.num,
        rows: [],
      });
    }
    histories.get(bucket.key).rows.push({
      row,
      date: bucket.date,
      day: bucket.day,
    });
  }

  const pairs = [];
  const orderedHistories = [...histories.values()]
    .sort((left, right) => left.key.localeCompare(right.key));

  for (const history of orderedHistories) {
    history.rows.sort((left, right) => left.day - right.day);
    for (let index = 1; index < history.rows.length; index += 1) {
      const previous = history.rows[index - 1];
      const actual = history.rows[index];
      if (actual.day - previous.day !== 1) continue;

      const forecast = forecastFrom(previous.row);
      const actualRotation = finite(actual.row.dailyRate);
      if (!forecast || actualRotation === null) continue;

      // Positive bias means the prediction was higher than the observed rate.
      const error = forecast.predictedRotation - actualRotation;
      const currentPriorBalls = finite(previous.row?.machine?.muraCoef);
      const predictionBorder = finite(previous.row?.border);
      const effectiveBorder = finite(previous.row?.effectiveBorder) ?? predictionBorder;
      const confidence = clamp(finite(previous.row?.confidence) ?? 0, 0, 1);
      const forecastScore = effectiveBorder === null
        ? 0
        : Math.max(0, (forecast.predictedRotation - effectiveBorder) * confidence * 100);
      const forecastSd = Math.sqrt(Math.max(0, forecast.forecastVariance));
      const selectionMargin = effectiveBorder === null
        ? -Infinity
        : forecast.predictedRotation - PE_BACKTEST_DEFAULTS.lcbK * forecastSd - effectiveBorder;
      const absoluteError = Math.abs(error);
      const actualStandardError = finite(actual.row?.dailyStandardError);

      pairs.push({
        id: `${history.key}___${previous.date}->${actual.date}`,
        key: history.key,
        store: history.store,
        machineName: history.machineName,
        num: history.num,
        predictionDate: previous.date,
        actualDate: actual.date,
        predictedRotation: forecast.predictedRotation,
        predictedLow: forecast.predictedLow,
        predictedHigh: forecast.predictedHigh,
        forecastVariance: forecast.forecastVariance,
        observationVariance: actualStandardError !== null && actualStandardError >= 0
          ? actualStandardError ** 2
          : 0,
        actualRotation,
        error,
        absoluteError,
        squaredError: error ** 2,
        within1: absoluteError <= 1,
        covered95: actualRotation >= forecast.predictedLow
          && actualRotation <= forecast.predictedHigh,
        predictionBorder,
        effectiveBorder,
        confidence,
        forecastScore,
        forecastVerdict: forecastVerdict(forecastScore, confidence),
        scoreBand: scoreBand(forecastScore, confidence),
        lcbRotation: forecast.predictedRotation - PE_BACKTEST_DEFAULTS.lcbK * forecastSd,
        selectionMargin,
        currentPriorBalls: currentPriorBalls !== null && currentPriorBalls > 0
          ? currentPriorBalls
          : null,
        machineRecordName: String(previous.row?.machine?.name || history.machineName),
        machineModelName: String(previous.row?.machine?.modelName || ""),
        calibrationHistory: Array.isArray(previous.row?.machine?.pevidenceCalibrationHistory)
          ? previous.row.machine.pevidenceCalibrationHistory
          : [],
      });
    }
  }

  annotateSelectionRanks(pairs, PE_BACKTEST_DEFAULTS.lcbK);
  return pairs;
}

export function summarizeBacktestPairs(pairs = []) {
  const usable = (Array.isArray(pairs) ? pairs : []).filter((pair) => (
    finite(pair?.error) !== null
    && finite(pair?.absoluteError) !== null
    && finite(pair?.squaredError) !== null
  ));
  const n = usable.length;
  if (n === 0) {
    return {
      n: 0,
      mae: null,
      bias: null,
      rmse: null,
      within1Rate: null,
      coverage95: null,
    };
  }

  const totals = usable.reduce((result, pair) => ({
    absoluteError: result.absoluteError + pair.absoluteError,
    error: result.error + pair.error,
    squaredError: result.squaredError + pair.squaredError,
    within1: result.within1 + (pair.within1 === true ? 1 : 0),
    covered95: result.covered95 + (pair.covered95 === true ? 1 : 0),
  }), {
    absoluteError: 0,
    error: 0,
    squaredError: 0,
    within1: 0,
    covered95: 0,
  });

  return {
    n,
    mae: totals.absoluteError / n,
    bias: totals.error / n,
    rmse: Math.sqrt(totals.squaredError / n),
    within1Rate: totals.within1 / n,
    coverage95: totals.covered95 / n,
  };
}

function median(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function processOptions(overrides = {}) {
  return {
    ...PE_BACKTEST_DEFAULTS,
    ...overrides,
    minProcessSamples: Math.max(
      3,
      Math.floor(finite(overrides?.minProcessSamples) ?? PE_BACKTEST_DEFAULTS.minProcessSamples),
    ),
    processShrinkageSamples: Math.max(
      1,
      finite(overrides?.processShrinkageSamples) ?? PE_BACKTEST_DEFAULTS.processShrinkageSamples,
    ),
    defaultProcessNoiseSd: clamp(
      finite(overrides?.defaultProcessNoiseSd) ?? PE_BACKTEST_DEFAULTS.defaultProcessNoiseSd,
      0.1,
      10,
    ),
    minProcessNoiseSd: clamp(
      finite(overrides?.minProcessNoiseSd) ?? PE_BACKTEST_DEFAULTS.minProcessNoiseSd,
      0,
      10,
    ),
    maxProcessNoiseSd: clamp(
      finite(overrides?.maxProcessNoiseSd) ?? PE_BACKTEST_DEFAULTS.maxProcessNoiseSd,
      0.1,
      20,
    ),
  };
}

function rawProcessVariance(pairs, options) {
  const usable = pairs.filter((pair) => finite(pair?.error) !== null);
  if (!usable.length) return null;
  const center = median(usable.map((pair) => pair.error)) ?? 0;
  const absoluteDeviations = usable.map((pair) => Math.abs(pair.error - center));
  const mad = median(absoluteDeviations) ?? 0;
  let innovationVariance = (1.4826 * mad) ** 2;
  // A perfectly repeated synthetic error has MAD=0. In that case the
  // centered mean square keeps the estimator deterministic without turning
  // a non-zero innovation into an artificial zero.
  if (!(innovationVariance > 0)) {
    innovationVariance = usable.reduce(
      (sum, pair) => sum + (pair.error - center) ** 2,
      0,
    ) / usable.length;
  }
  const knownVariance = median(usable.map((pair) => (
    Math.max(0, finite(pair?.forecastVariance) ?? 0)
    + Math.max(0, finite(pair?.observationVariance) ?? 0)
  ))) ?? 0;
  const minVariance = options.minProcessNoiseSd ** 2;
  const maxVariance = options.maxProcessNoiseSd ** 2;
  return clamp(innovationVariance - knownVariance, minVariance, maxVariance);
}

/**
 * Estimates the irreducible one-night change in rotation rate.
 *
 * The estimate uses only forecast -> next-day observation pairs. Measurement
 * and posterior variance are removed from the innovation variance; sparse
 * store/machine groups are shrunk toward the global estimate.
 */
export function estimateProcessNoise(pairs = [], overrides = {}) {
  const options = processOptions(overrides);
  const usable = (Array.isArray(pairs) ? pairs : []).filter((pair) => (
    finite(pair?.error) !== null
  ));
  const fallbackVariance = options.defaultProcessNoiseSd ** 2;
  const learnedGlobal = usable.length >= options.minProcessSamples
    ? rawProcessVariance(usable, options)
    : null;
  const globalVariance = learnedGlobal ?? fallbackVariance;
  const global = {
    n: usable.length,
    variance: globalVariance,
    sd: Math.sqrt(globalVariance),
    source: learnedGlobal === null ? "default" : "learned",
    minRequired: options.minProcessSamples,
  };

  const groups = new Map();
  for (const pair of usable) {
    const key = `${String(pair.store || "").trim()}___${String(pair.machineName || "").trim()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pair);
  }
  const byProfileList = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, profilePairs]) => {
      const localRaw = profilePairs.length >= options.minProcessSamples
        ? rawProcessVariance(profilePairs, options)
        : null;
      const reliability = localRaw === null
        ? 0
        : profilePairs.length / (profilePairs.length + options.processShrinkageSamples);
      const variance = localRaw === null
        ? globalVariance
        : reliability * localRaw + (1 - reliability) * globalVariance;
      return {
        key,
        store: profilePairs[0]?.store || "",
        machineName: profilePairs[0]?.machineName || "",
        n: profilePairs.length,
        variance,
        sd: Math.sqrt(variance),
        reliability,
        source: localRaw === null ? "global" : "pooled",
        minRequired: options.minProcessSamples,
      };
    });
  return {
    global,
    byProfile: Object.fromEntries(byProfileList.map((profile) => [profile.key, profile])),
    byProfileList,
    method: "robust-innovation-minus-known-variance-v1",
  };
}

function metricsForErrorValues(values) {
  if (!values.length) return {
    n: 0,
    mae: null,
    bias: null,
    rmse: null,
  };
  const n = values.length;
  const bias = values.reduce((sum, value) => sum + value, 0) / n;
  const mae = values.reduce((sum, value) => sum + Math.abs(value), 0) / n;
  const rmse = Math.sqrt(values.reduce((sum, value) => sum + value ** 2, 0) / n);
  return { n, mae, bias, rmse };
}

function selectionBiasOptions(overrides = {}) {
  return {
    ...PE_BACKTEST_DEFAULTS,
    ...overrides,
    selectionBiasMinSamples: Math.max(
      5,
      Math.floor(finite(overrides?.selectionBiasMinSamples) ?? PE_BACKTEST_DEFAULTS.selectionBiasMinSamples),
    ),
    selectionBiasValidationWarmup: Math.max(
      3,
      Math.floor(finite(overrides?.selectionBiasValidationWarmup) ?? PE_BACKTEST_DEFAULTS.selectionBiasValidationWarmup),
    ),
    selectionBiasPriorSamples: Math.max(
      1,
      finite(overrides?.selectionBiasPriorSamples) ?? PE_BACKTEST_DEFAULTS.selectionBiasPriorSamples,
    ),
    selectionBiasMax: Math.max(
      0,
      finite(overrides?.selectionBiasMax) ?? PE_BACKTEST_DEFAULTS.selectionBiasMax,
    ),
  };
}

function shrunkenBias(pairs, options) {
  const metrics = summarizeBacktestPairs(pairs);
  if (!metrics.n) return 0;
  const reliability = metrics.n / (metrics.n + options.selectionBiasPriorSamples);
  return clamp(metrics.bias * reliability, -options.selectionBiasMax, options.selectionBiasMax);
}

function rollingBiasValidation(pairs, options) {
  const ordered = [...pairs].sort((left, right) => (
    (dayNumber(left.predictionDate) ?? -Infinity) - (dayNumber(right.predictionDate) ?? -Infinity)
    || String(left.id || "").localeCompare(String(right.id || ""))
  ));
  const prior = [];
  const rawErrors = [];
  const correctedErrors = [];
  for (const pair of ordered) {
    if (prior.length >= options.selectionBiasValidationWarmup) {
      const correction = shrunkenBias(prior, options);
      rawErrors.push(pair.error);
      correctedErrors.push(pair.error - correction);
    }
    prior.push(pair);
  }
  const raw = metricsForErrorValues(rawErrors);
  const corrected = metricsForErrorValues(correctedErrors);
  return {
    raw,
    corrected,
    improvesMae: raw.n > 0 && corrected.mae <= raw.mae,
    method: "expanding-window-prior-only-v1",
  };
}

function groupedMetrics(pairs, field, orderedKeys = []) {
  const groups = new Map();
  for (const pair of pairs) {
    const key = String(pair?.[field] ?? "unknown");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pair);
  }
  const keys = [
    ...orderedKeys.filter((key) => groups.has(key)),
    ...[...groups.keys()].filter((key) => !orderedKeys.includes(key)).sort(),
  ];
  return Object.fromEntries(keys.map((key) => [key, summarizeBacktestPairs(groups.get(key))]));
}

export function buildSelectionBacktest(pairs = [], overrides = {}) {
  const options = selectionBiasOptions(overrides);
  const usable = (Array.isArray(pairs) ? pairs : []).filter((pair) => (
    finite(pair?.error) !== null
  ));
  const top5Pairs = usable.filter((pair) => pair.recommendedTop5 === true);
  const top5 = summarizeBacktestPairs(top5Pairs);
  const validation = rollingBiasValidation(top5Pairs, options);
  const enoughSamples = top5.n >= options.selectionBiasMinSamples;
  const correction = enoughSamples ? shrunkenBias(top5Pairs, options) : 0;
  const appliesAutomatically = Boolean(
    enoughSamples
    && validation.raw.n >= options.selectionBiasValidationWarmup
    && validation.improvesMae
    && Math.abs(correction) >= 0.05
  );
  return {
    overall: summarizeBacktestPairs(usable),
    recommendedTop5: top5,
    byVerdict: groupedMetrics(usable, "forecastVerdict", ["nodata", "weak", "watch", "strong"]),
    byScoreBand: groupedMetrics(usable, "scoreBand", ["nodata", "0-9", "10-49", "50+"]),
    biasCorrection: {
      sampleCount: top5.n,
      minRequired: options.selectionBiasMinSamples,
      proposedRotationAdjustment: -correction,
      overpredictionBias: correction,
      appliedRotationAdjustment: appliesAutomatically ? -correction : 0,
      appliesAutomatically,
      status: !enoughSamples
        ? "awaiting-samples"
        : appliesAutomatically ? "active" : "shadow-validation",
      validation,
      method: "top5-shrunken-bias-with-expanding-validation-v1",
    },
  };
}

function roundedPriorBalls(value, options) {
  const bounded = clamp(value, options.minPriorBalls, options.maxPriorBalls);
  return Math.round(bounded / options.calibrationStepBalls) * options.calibrationStepBalls;
}

function proposedPriorFactor(pairs, metrics) {
  let factor = 1;

  // In the current P-EVIDENCE model, more prior balls means a more conservative
  // estimate and a wider prior-led interval. Coverage therefore supplies a
  // cautious direction, not an automatic parameter update.
  if (metrics.coverage95 < 0.9) factor *= 1.25;
  else if (metrics.coverage95 > 0.99) factor *= 0.9;

  const withBorder = pairs.filter((pair) => finite(pair.predictionBorder) !== null);
  if (withBorder.length >= Math.ceil(pairs.length * 0.8)) {
    const forecastMse = withBorder.reduce(
      (sum, pair) => sum + (pair.predictedRotation - pair.actualRotation) ** 2,
      0,
    ) / withBorder.length;
    const borderMse = withBorder.reduce(
      (sum, pair) => sum + (pair.predictionBorder - pair.actualRotation) ** 2,
      0,
    ) / withBorder.length;
    if (borderMse > 0) {
      const relativeRmse = Math.sqrt(forecastMse / borderMse);
      if (relativeRmse <= 0.9) factor *= 0.8;
      else if (relativeRmse >= 1.1) factor *= 1.25;
    }
  }

  return clamp(factor, 0.5, 2);
}

/**
 * Returns proposal objects only. It never edits row.machine or a machine master.
 */
export function buildCalibrationCandidates(pairs = [], overrides = {}) {
  const options = {
    ...PE_BACKTEST_DEFAULTS,
    ...overrides,
    // Twenty observations is the safety floor; callers may require more.
    minCalibrationSamples: Math.max(
      PE_BACKTEST_DEFAULTS.minCalibrationSamples,
      Math.floor(finite(overrides?.minCalibrationSamples) ?? PE_BACKTEST_DEFAULTS.minCalibrationSamples),
    ),
    calibrationStepBalls: Math.max(
      1,
      finite(overrides?.calibrationStepBalls) ?? PE_BACKTEST_DEFAULTS.calibrationStepBalls,
    ),
    minPriorBalls: Math.max(
      1,
      finite(overrides?.minPriorBalls) ?? PE_BACKTEST_DEFAULTS.minPriorBalls,
    ),
    maxPriorBalls: Math.max(
      PE_BACKTEST_DEFAULTS.minPriorBalls,
      finite(overrides?.maxPriorBalls) ?? PE_BACKTEST_DEFAULTS.maxPriorBalls,
    ),
  };

  const groups = new Map();
  for (const pair of Array.isArray(pairs) ? pairs : []) {
    const machineName = String(pair?.machineName ?? "").trim();
    if (!machineName) continue;
    if (!groups.has(machineName)) groups.set(machineName, []);
    groups.get(machineName).push(pair);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([machineName, machinePairs]) => {
      const metrics = summarizeBacktestPairs(machinePairs);
      const orderedPairs = [...machinePairs].sort((left, right) => (
        (dayNumber(left.actualDate) ?? -Infinity) - (dayNumber(right.actualDate) ?? -Infinity)
        || String(left.id || "").localeCompare(String(right.id || ""))
      ));
      const latestPair = orderedPairs.at(-1) || null;
      const latestPrior = finite(latestPair?.currentPriorBalls);
      const currentPriorBalls = latestPrior !== null && latestPrior > 0
        ? latestPrior
        : median(machinePairs
          .map((pair) => finite(pair.currentPriorBalls))
          .filter((value) => value !== null && value > 0));
      const recordNames = [...new Set(machinePairs
        .map((pair) => String(pair?.machineRecordName || "").trim())
        .filter(Boolean))];
      const modelNames = [...new Set(machinePairs
        .map((pair) => String(pair?.machineModelName || "").trim())
        .filter(Boolean))];
      const canonicalMachineReady = recordNames.length === 1 && modelNames.length <= 1;
      const latestHistory = Array.isArray(latestPair?.calibrationHistory)
        ? latestPair.calibrationHistory
        : [];
      const previousCalibration = [...latestHistory]
        .filter((entry) => Number.isFinite(dayNumber(entry?.effectiveFrom)))
        .sort((left, right) => (
          dayNumber(left.effectiveFrom) - dayNumber(right.effectiveFrom)
          || String(left.approvedAt || "").localeCompare(String(right.approvedAt || ""))
        ))
        .at(-1) || null;
      const samplesSinceCalibration = previousCalibration
        ? machinePairs.filter((pair) => (
          Number.isFinite(dayNumber(pair?.predictionDate))
          && dayNumber(pair.predictionDate) >= dayNumber(previousCalibration.effectiveFrom)
        )).length
        : metrics.n;
      const enoughNewSamples = !previousCalibration
        || samplesSinceCalibration >= options.minCalibrationSamples;
      const enoughSamples = metrics.n >= options.minCalibrationSamples;
      const canRecommend = enoughSamples
        && enoughNewSamples
        && canonicalMachineReady
        && currentPriorBalls !== null;
      const recommendedPriorBalls = canRecommend
        ? roundedPriorBalls(
          currentPriorBalls * proposedPriorFactor(machinePairs, metrics),
          options,
        )
        : null;
      const hasRecommendedChange = canRecommend
        && recommendedPriorBalls !== currentPriorBalls;

      return {
        machineName,
        machineRecordName: recordNames[0] || "",
        machineModelName: modelNames[0] || "",
        n: metrics.n,
        minRequired: options.minCalibrationSamples,
        evidenceThroughDate: latestPair?.actualDate || "",
        stores: [...new Set(machinePairs.map((pair) => pair.store).filter(Boolean))],
        currentPriorBalls,
        recommendedPriorBalls,
        eligible: hasRecommendedChange,
        reason: !enoughSamples
          ? "insufficient-samples"
          : !canonicalMachineReady
            ? "ambiguous-machine"
            : !enoughNewSamples
              ? "awaiting-new-samples"
              : currentPriorBalls === null
                ? "missing-current-prior"
                : !hasRecommendedChange
                  ? "no-change"
                  : "proposal-only",
        previousCalibrationSamples: previousCalibration?.sampleCount ?? null,
        samplesSinceCalibration,
        remainingSamples: previousCalibration && !enoughNewSamples
          ? Math.max(0, options.minCalibrationSamples - samplesSinceCalibration)
          : 0,
        method: canRecommend ? "coverage-and-border-benchmark-v1" : null,
        proposalOnly: true,
        appliesAutomatically: false,
      };
    });
}

function isoDateFromDay(day) {
  if (!Number.isFinite(day)) return "";
  return new Date(day * 86400000).toISOString().slice(0, 10);
}

function weekStartDay(value) {
  const day = dayNumber(value);
  if (!Number.isFinite(day)) return null;
  const weekday = new Date(day * 86400000).getUTCDay();
  return day - ((weekday + 6) % 7);
}

export function buildWeeklyBacktestTrend(pairs = [], { maxWeeks = 12 } = {}) {
  const groups = new Map();
  for (const pair of Array.isArray(pairs) ? pairs : []) {
    const startDay = weekStartDay(pair?.actualDate);
    if (!Number.isFinite(startDay)) continue;
    if (!groups.has(startDay)) groups.set(startDay, []);
    groups.get(startDay).push(pair);
  }
  const trend = [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([startDay, weekPairs]) => {
      const metrics = summarizeBacktestPairs(weekPairs);
      const eventMap = new Map();
      for (const pair of weekPairs) {
        for (const entry of Array.isArray(pair?.calibrationHistory) ? pair.calibrationHistory : []) {
          const effectiveDay = dayNumber(entry?.effectiveFrom);
          if (!Number.isFinite(effectiveDay) || effectiveDay < startDay || effectiveDay > startDay + 6) continue;
          const key = `${pair.machineRecordName}___${entry.id || entry.approvedAt || entry.effectiveFrom}`;
          if (!eventMap.has(key)) {
            eventMap.set(key, {
              machineName: pair.machineRecordName || pair.machineName,
              effectiveFrom: normalizeEvidenceDate(entry.effectiveFrom),
              previousPriorBalls: finite(entry.previousPriorBalls),
              appliedPriorBalls: finite(entry.appliedPriorBalls),
            });
          }
        }
      }
      return {
        weekStart: isoDateFromDay(startDay),
        weekEnd: isoDateFromDay(startDay + 6),
        ...metrics,
        calibrationEvents: [...eventMap.values()],
      };
    });
  const limit = Math.max(1, Math.floor(finite(maxWeeks) ?? 12));
  return trend.slice(-limit);
}

export function buildPEvidenceBacktest(rows = [], options = {}) {
  const pairs = buildBacktestPairs(rows);
  const groups = new Map();
  for (const pair of pairs) {
    if (!groups.has(pair.key)) groups.set(pair.key, []);
    groups.get(pair.key).push(pair);
  }

  const byKeyList = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, keyPairs]) => ({
      key,
      store: keyPairs[0].store,
      machineName: keyPairs[0].machineName,
      num: keyPairs[0].num,
      ...summarizeBacktestPairs(keyPairs),
    }));
  const byKey = Object.fromEntries(byKeyList.map((summary) => [summary.key, summary]));
  const selection = buildSelectionBacktest(pairs, options);

  return {
    pairs,
    overall: summarizeBacktestPairs(pairs),
    byKey,
    byKeyList,
    calibrationCandidates: buildCalibrationCandidates(pairs, options),
    weeklyTrend: buildWeeklyBacktestTrend(pairs, options),
    selection,
    biasCorrection: selection.biasCorrection,
    biasDefinition: "prediction-minus-actual",
  };
}
