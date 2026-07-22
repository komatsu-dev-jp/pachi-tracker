const finiteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const YUTIME_AUTO_REACH_THRESHOLD = 0.35;
export const YUTIME_AUTO_MIN_REMAINING = 120;

export function getActiveYutimeRun(runs = []) {
  const list = Array.isArray(runs) ? runs : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (list[index]?.status === "active") return list[index];
  }
  return null;
}

export function shouldAutoShowYutimeCard({ spec, result, activeRun } = {}) {
  if (activeRun?.status === "active") return true;
  if (!spec || !(finiteNumber(spec.triggerLowSpins) > 0) || spec.consumed === true) return false;
  if (spec.targetingEnabled === true) return true;
  if (!result || result.arrivalReady === false) return false;

  const remaining = finiteNumber(result.remainingSpins, Number.POSITIVE_INFINITY);
  const reachProbability = finiteNumber(result.reachProbability, -1);
  return remaining <= 0
    || remaining <= YUTIME_AUTO_MIN_REMAINING
    || reachProbability >= YUTIME_AUTO_REACH_THRESHOLD;
}

export function getYutimeCardStage({ spec, result, activeRun } = {}) {
  if (activeRun?.status === "active") return "active";
  if (!shouldAutoShowYutimeCard({ spec, result, activeRun })) return "hidden";
  if (finiteNumber(result?.remainingSpins, Number.POSITIVE_INFINITY) <= 0) return "ready";
  return spec?.targetingEnabled === true ? "targeting" : "approaching";
}

export function createYutimeRun({
  id,
  machineName,
  triggerLowSpins,
  durationSpins,
  entryLowSpins,
  entryCumRot,
  startBalls,
  playMode,
  enteredAt,
} = {}) {
  const timestamp = enteredAt || new Date().toISOString();
  return {
    id: String(id || `yutime-${Date.now()}`),
    status: "active",
    outcome: null,
    machineName: String(machineName || ""),
    triggerLowSpins: Math.max(0, Math.round(finiteNumber(triggerLowSpins))),
    durationSpins: Math.max(0, Math.round(finiteNumber(durationSpins))),
    entryLowSpins: Math.max(0, Math.round(finiteNumber(entryLowSpins))),
    entryCumRot: Math.max(0, Math.round(finiteNumber(entryCumRot))),
    supportSpins: 0,
    supportCashYen: 0,
    startBalls: Math.max(0, Math.round(finiteNumber(startBalls))),
    endBalls: null,
    playMode: playMode === "mochi" || playMode === "chodama" ? playMode : "cash",
    linkedChainId: null,
    enteredAt: timestamp,
    endedAt: null,
  };
}

export function addYutimeSupportCash(runs = [], runId, amountYen) {
  const amount = Math.max(0, Math.round(finiteNumber(amountYen)));
  if (!amount) return Array.isArray(runs) ? runs : [];
  return (Array.isArray(runs) ? runs : []).map((run) => (
    run?.id === runId && run.status === "active"
      ? { ...run, supportCashYen: Math.max(0, finiteNumber(run.supportCashYen)) + amount }
      : run
  ));
}

export function completeYutimeRun(runs = [], runId, {
  outcome,
  supportSpins,
  endBalls,
  linkedChainId = null,
  endedAt,
} = {}) {
  const resolvedOutcome = outcome === "hit" ? "hit" : "through";
  return (Array.isArray(runs) ? runs : []).map((run) => (
    run?.id === runId && run.status === "active"
      ? {
        ...run,
        status: "completed",
        outcome: resolvedOutcome,
        supportSpins: Math.max(0, Math.round(finiteNumber(supportSpins))),
        endBalls: Math.max(0, Math.round(finiteNumber(endBalls))),
        linkedChainId: linkedChainId || null,
        endedAt: endedAt || new Date().toISOString(),
      }
      : run
  ));
}

export function sumYutimeSupportCash(runs = []) {
  return (Array.isArray(runs) ? runs : []).reduce(
    (sum, run) => sum + Math.max(0, finiteNumber(run?.supportCashYen)),
    0,
  );
}

export function countNormalFirstHits(jpLog = []) {
  return (Array.isArray(jpLog) ? jpLog : []).filter((chain) => chain?.origin !== "yutime").length;
}
