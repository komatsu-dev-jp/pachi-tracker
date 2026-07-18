// 非等価交換を含む、現金・持ち玉・貯玉の経済価値を統一して扱う純粋関数。
//
// calcPreciseEV は保護対象のため変更しない。既存計算が返す「払出期待額」と
// 投資区分を利用し、この層で持ち玉・貯玉を交換価値へ正しく換算する。

export const ECONOMIC_CALCULATION_VERSION = 2;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback) {
  const number = finite(value, 0);
  return number > 0 ? number : fallback;
}

function clampNonNegative(value) {
  return Math.max(0, finite(value, 0));
}

export function exchangeYenPerBall(exRate, fallbackExRate = 250) {
  return 1000 / positive(exRate, positive(fallbackExRate, 250));
}

export function heldBallCostPerK(rentBalls, exRate) {
  const rent = positive(rentBalls, 250);
  const exchange = positive(exRate, rent);
  return 1000 * rent / exchange;
}

export function deriveUsageFromRows(rotRows, rentBalls = 250) {
  const rent = positive(rentBalls, 250);
  const dataRows = Array.isArray(rotRows) ? rotRows.filter((row) => row?.type === "data") : [];
  let cashKCount = 0;
  let mochiKCount = 0;
  let chodamaKCount = 0;
  let previousInvest = 0;

  for (const row of dataRows) {
    const invest = finite(row?.invest, 0);
    const investDiff = invest - previousInvest;
    previousInvest = invest;
    if (row?.mode === "mochi" || row?.mode === "chodama") {
      // logic.js の既存互換に合わせ、未設定時だけ1K分へフォールバックする。
      const hasExplicitConsumption = row.ballsConsumed !== undefined && row.ballsConsumed !== null;
      const consumed = hasExplicitConsumption ? clampNonNegative(row.ballsConsumed) : rent;
      if (row.mode === "mochi") mochiKCount += consumed / rent;
      else chodamaKCount += consumed / rent;
    } else {
      cashKCount += investDiff / 1000;
    }
  }

  return {
    cashKCount: clampNonNegative(cashKCount),
    mochiKCount: clampNonNegative(mochiKCount),
    chodamaKCount: clampNonNegative(chodamaKCount),
  };
}

function resolveUsage(ev, rotRows, rentBalls) {
  const fromRows = deriveUsageFromRows(rotRows, rentBalls);
  const hasStatsUsage = [ev?.cashKCount, ev?.mochiKCount, ev?.chodamaKCount]
    .some((value) => Number.isFinite(Number(value)) && Number(value) > 0);
  if (!hasStatsUsage) return fromRows;
  return {
    cashKCount: clampNonNegative(ev?.cashKCount),
    mochiKCount: clampNonNegative(ev?.mochiKCount),
    chodamaKCount: clampNonNegative(ev?.chodamaKCount),
  };
}

function buildChainModeMap(rotRows) {
  const map = new Map();
  for (const row of Array.isArray(rotRows) ? rotRows : []) {
    if (row?.type !== "hit" || row.chainId == null) continue;
    map.set(String(row.chainId), row.mode || "unknown");
  }
  return map;
}

export function calculateTrayCreditYen({
  rotRows,
  jpLog,
  totalTrayBalls = 0,
  rentBalls = 250,
  exRate = rentBalls,
} = {}) {
  const rent = positive(rentBalls, 250);
  const exchange = positive(exRate, rent);
  const cashYenPerBall = 1000 / rent;
  const heldYenPerBall = 1000 / exchange;
  const chainModes = buildChainModeMap(rotRows);
  let loggedTrayBalls = 0;
  let creditYen = 0;

  for (const chain of Array.isArray(jpLog) ? jpLog : []) {
    const balls = clampNonNegative(chain?.trayBalls);
    if (balls <= 0) continue;
    loggedTrayBalls += balls;
    const mode = chain?.chainId == null ? "unknown" : chainModes.get(String(chain.chainId));
    // 古い記録でモード不明の場合は、期待値を過大にしにくい交換単価を使う。
    creditYen += balls * (mode === "cash" ? cashYenPerBall : heldYenPerBall);
  }

  if (loggedTrayBalls <= 0) {
    const fallbackBalls = clampNonNegative(totalTrayBalls);
    creditYen = fallbackBalls * heldYenPerBall;
    loggedTrayBalls = fallbackBalls;
  }

  return { trayBalls: loggedTrayBalls, trayCreditYen: creditYen };
}

function resolveRawWorkAmount(ev, totalKCount, netRot) {
  if (Number.isFinite(Number(ev?.workAmount))) return Number(ev.workAmount);
  if (Number.isFinite(Number(ev?.evPerRot)) && netRot > 0) {
    return Number(ev.evPerRot) * netRot;
  }
  if (Number.isFinite(Number(ev?.ev1K)) && totalKCount > 0) {
    return Number(ev.ev1K) * totalKCount;
  }
  return null;
}

export function applyEconomicEV(ev = {}, {
  rotRows = [],
  jpLog = [],
  totalTrayBalls = 0,
  rentBalls = 250,
  exRate = rentBalls,
  rotPerHour = 0,
} = {}) {
  const rent = positive(rentBalls, 250);
  const exchange = positive(exRate, rent);
  const usage = resolveUsage(ev, rotRows, rent);
  const { cashKCount, mochiKCount, chodamaKCount } = usage;
  const totalKCount = cashKCount + mochiKCount + chodamaKCount;
  const netRot = clampNonNegative(ev?.netRot);
  const rawWorkAmount = resolveRawWorkAmount(ev, totalKCount, netRot);
  const heldCostK = heldBallCostPerK(rent, exchange);
  const cashCostYen = cashKCount * 1000;
  const mochiCostYen = mochiKCount * heldCostK;
  // 判断用EVでは、設定のON/OFFにかかわらず貯玉を資産として扱う。
  const chodamaCostYen = chodamaKCount * heldCostK;
  const grossCostYen = cashCostYen + mochiCostYen + chodamaCostYen;
  const tray = calculateTrayCreditYen({ rotRows, jpLog, totalTrayBalls, rentBalls: rent, exRate: exchange });
  const economicCostYen = Math.max(0, grossCostYen - tray.trayCreditYen);
  const economicKCount = economicCostYen / 1000;
  const hasEconomicRate = economicKCount > 0 && netRot > 0;
  const economicStart1K = hasEconomicRate ? netRot / economicKCount : 0;
  const rawGrossExpectedYen = rawWorkAmount == null ? null : rawWorkAmount + totalKCount * 1000;
  const economicWorkAmount = rawGrossExpectedYen == null
    ? finite(ev?.effectiveWorkAmount ?? ev?.workAmount, 0)
    : rawGrossExpectedYen - economicCostYen;
  const economicEV1K = hasEconomicRate ? economicWorkAmount / economicKCount : null;
  const useBorder = positive(ev?.useBorder ?? ev?.theoreticalBorder, 0);
  const economicBDiff = hasEconomicRate && useBorder > 0 ? economicStart1K - useBorder : null;
  const economicEvPerRot = netRot > 0 ? economicWorkAmount / netRot : 0;
  const hours = positive(rotPerHour, 0) > 0 && netRot > 0 ? netRot / positive(rotPerHour, 0) : 0;
  const economicWage = hours > 0 ? economicWorkAmount / hours : 0;
  const ratioBase = totalKCount > 0 ? totalKCount : 1;

  return {
    ...ev,
    calculationVersion: ECONOMIC_CALCULATION_VERSION,
    economicStatus: rawGrossExpectedYen == null ? "fallback" : "calculated",
    legacyCorrectedInvestYen: ev?.correctedInvestYen,
    legacyEffectiveStart1K: ev?.effectiveStart1K,
    legacyEffectiveEV1K: ev?.effectiveEV1K,
    legacyEffectiveWorkAmount: ev?.effectiveWorkAmount,
    rentBalls: rent,
    exRate: exchange,
    cashKCount,
    mochiKCount,
    chodamaKCount,
    totalKCount,
    cashRatio: totalKCount > 0 ? cashKCount / ratioBase : 0,
    mochiRatio: totalKCount > 0 ? mochiKCount / ratioBase : 0,
    chodamaRatio: totalKCount > 0 ? chodamaKCount / ratioBase : 0,
    nonCashRatio: totalKCount > 0 ? (mochiKCount + chodamaKCount) / ratioBase : 0,
    heldBallCostPerK: heldCostK,
    cashCostYen,
    mochiCostYen,
    chodamaCostYen,
    trayCorrection: tray.trayBalls,
    trayBallsYen: Math.round(tray.trayCreditYen),
    economicTrayCreditYen: tray.trayCreditYen,
    correctedInvestYen: economicCostYen,
    economicCostYen,
    economicKCount,
    economicStart1K,
    economicEV1K,
    economicBDiff,
    economicEvPerRot,
    economicWorkAmount,
    economicWage,
    effectiveStart1K: hasEconomicRate ? economicStart1K : (ev?.effectiveStart1K ?? ev?.start1K ?? 0),
    effectiveEV1K: economicEV1K ?? ev?.effectiveEV1K ?? ev?.ev1K ?? 0,
    effectiveBDiff: economicBDiff ?? ev?.effectiveBDiff ?? ev?.bDiff ?? 0,
    effectiveEvPerRot: economicEvPerRot,
    effectiveWorkAmount: economicWorkAmount,
    effectiveWage: economicWage,
  };
}

export function normalizeArchiveEconomics(archive) {
  if (!archive || typeof archive !== "object") return archive;
  if (archive.gameType === "slot") return archive;
  if (Number(archive?.stats?.calculationVersion) >= ECONOMIC_CALCULATION_VERSION) return archive;
  const settings = archive.settings || {};
  const stats = applyEconomicEV(archive.stats || {}, {
    rotRows: archive.rotRows,
    jpLog: archive.jpLog,
    totalTrayBalls: archive.totalTrayBalls,
    rentBalls: settings.rentBalls,
    exRate: settings.exRate,
    rotPerHour: settings.rotPerHour,
  });
  const chodamaBalls = stats.chodamaKCount * positive(settings.rentBalls, 250);
  const chodamaYen = Math.round(chodamaBalls * exchangeYenPerBall(settings.exRate, settings.rentBalls));
  return { ...archive, stats, chodamaYen };
}

export function normalizeArchivesEconomics(archives) {
  return Array.isArray(archives) ? archives.map(normalizeArchiveEconomics) : [];
}
