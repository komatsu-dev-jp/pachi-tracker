import { evidenceDayNumber, normalizeEvidenceDate } from "../../evidenceDate.js";

export const PE_BACKTEST_DEFAULTS = Object.freeze({
  minCalibrationSamples: 20,
  calibrationStepBalls: 2500,
  minPriorBalls: 2500,
  maxPriorBalls: 500000,
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
  return { predictedRotation, predictedLow, predictedHigh };
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
      const absoluteError = Math.abs(error);

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
        actualRotation,
        error,
        absoluteError,
        squaredError: error ** 2,
        within1: absoluteError <= 1,
        covered95: actualRotation >= forecast.predictedLow
          && actualRotation <= forecast.predictedHigh,
        predictionBorder,
        currentPriorBalls: currentPriorBalls !== null && currentPriorBalls > 0
          ? currentPriorBalls
          : null,
      });
    }
  }

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
      const currentPriorBalls = median(machinePairs
        .map((pair) => finite(pair.currentPriorBalls))
        .filter((value) => value !== null && value > 0));
      const enoughSamples = metrics.n >= options.minCalibrationSamples;
      const canRecommend = enoughSamples && currentPriorBalls !== null;
      const recommendedPriorBalls = canRecommend
        ? roundedPriorBalls(
          currentPriorBalls * proposedPriorFactor(machinePairs, metrics),
          options,
        )
        : null;

      return {
        machineName,
        n: metrics.n,
        minRequired: options.minCalibrationSamples,
        currentPriorBalls,
        recommendedPriorBalls,
        eligible: canRecommend,
        reason: !enoughSamples
          ? "insufficient-samples"
          : currentPriorBalls === null
            ? "missing-current-prior"
            : "proposal-only",
        method: canRecommend ? "coverage-and-border-benchmark-v1" : null,
        proposalOnly: true,
        appliesAutomatically: false,
      };
    });
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

  return {
    pairs,
    overall: summarizeBacktestPairs(pairs),
    byKey,
    byKeyList,
    calibrationCandidates: buildCalibrationCandidates(pairs, options),
    biasDefinition: "prediction-minus-actual",
  };
}
