import { DEFAULT_RENT_BALLS, isValidRentBalls } from "./rentBalls.js";

export function normalizeChodamaBalls(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}

export function normalizeOptionalFiniteNumber(value) {
  if (typeof value === "string" && value.trim() === "") return undefined;
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function resolveRecordStartSpecSapo({ draft, machineSpecSapo }) {
  const draftValue = draft && Object.prototype.hasOwnProperty.call(draft, "specSapo")
    ? normalizeOptionalFiniteNumber(draft.specSapo)
    : undefined;
  return draftValue ?? normalizeOptionalFiniteNumber(machineSpecSapo) ?? 0;
}

export function findRecordStartStore(stores, storeId) {
  if (storeId == null || String(storeId).trim() === "") return null;
  return (Array.isArray(stores) ? stores : []).find((store) => (
    store && typeof store === "object" && store.id != null && String(store.id) === String(storeId)
  )) || null;
}

export function createRecordStartDraft({ selection, stores, rentBalls, exRate, id }) {
  const selectedStore = findRecordStartStore(stores, selection?.storeId);
  const isYutime = selection?.source === "yutime-calculator";
  const rentBallsContext = resolveRecordStartRentBallsContext({
    selectionRentBalls: isYutime ? selection?.rentBalls : undefined,
    storeRentBalls: selectedStore?.rentBalls,
    appRentBalls: rentBalls,
  });
  return {
    id,
    source: isYutime ? "yutime-calculator" : "strategy-map",
    storeId: selectedStore ? selectedStore.id : (selection?.storeId ?? null),
    storeName: String(selection?.storeName || selectedStore?.name || ""),
    machineName: String(selection?.machineName || ""),
    machineNum: String(selection?.machineNum ?? selection?.num ?? ""),
    rentBalls: rentBallsContext.value,
    rentBallsContext,
    exRate: isYutime ? (Number(selection?.exRate) || Number(selectedStore?.exRate) || Number(exRate) || 250) : (Number(selectedStore?.exRate) || Number(exRate) || 250),
    closingTime: String(selectedStore?.closingTime || ""),
    plannedStart1K: Number(selection?.plannedStart1K ?? selection?.rot) || 0,
    ...(selectedStore ? { initialChodama: normalizeChodamaBalls(selectedStore.chodama) } : {}),
    ...(isYutime ? {
      startRot: Math.max(0, Math.round(Number(selection.startRot) || 0)),
      yutimeLowSpins: Math.max(0, Math.round(Number(selection.yutimeLowSpins) || 0)),
      yutimeStart1K: Number(selection.yutimeStart1K) || 0,
      investPace: Number(selection.investPace) || 0,
      synthDenom: Number(selection.synthDenom) || 0,
      spec1R: Number(selection.spec1R) || 0,
      specAvgRounds: Number(selection.specAvgRounds) || 0,
      ...(normalizeOptionalFiniteNumber(selection.specSapo) !== undefined ? { specSapo: normalizeOptionalFiniteNumber(selection.specSapo) } : {}),
      yutimeSession: selection.yutimeSession || null,
    } : {}),
  };
}

export function createYutimeRecordStartSelection(value) {
  const number = (item) => Math.max(0, Math.round(Number(item) || 0));
  return {
    source: "yutime-calculator",
    storeId: value?.storeId ?? null,
    storeName: String(value?.storeName || ""),
    machineName: String(value?.machineName || ""),
    machineNum: String(value?.machineNum || ""),
    startRot: number(value?.currentLowSpins),
    yutimeLowSpins: number(value?.currentLowSpins),
    plannedStart1K: Number(value?.assumedStart1K) || 0,
    yutimeStart1K: Number(value?.assumedStart1K) || 0,
    rentBalls: Number(value?.rentBalls) || 0,
    exRate: Number(value?.exRate) || 0,
    investPace: Number(value?.investPace) || 0,
    synthDenom: Number(value?.synthDenom) || 0,
    spec1R: Number(value?.spec1R) || 0,
    specAvgRounds: Number(value?.specAvgRounds) || 0,
    ...(normalizeOptionalFiniteNumber(value?.specSapo) !== undefined ? { specSapo: normalizeOptionalFiniteNumber(value.specSapo) } : {}),
    yutimeSession: value?.yutimeSession || null,
  };
}

export function createStrategyMapYutimeInitialContext({ storeId, storeName, machineNum }) {
  return {
    initialStoreId: storeId ?? null,
    initialStoreName: String(storeName || ""),
    initialMachineNum: String(machineNum ?? ""),
  };
}

export function shouldDiscardSameDayResumeForYutimeAction(action) {
  return action === "replace" || action === "move" || action === "update";
}

export function setupInitialChodamaFromDraft(draft) {
  return draft && Object.prototype.hasOwnProperty.call(draft, "initialChodama")
    ? String(draft.initialChodama)
    : null;
}

export function resolveRecordStartChodama(stores, storeId, setupValue) {
  if (setupValue != null) return normalizeChodamaBalls(setupValue);
  return normalizeChodamaBalls(findRecordStartStore(stores, storeId)?.chodama);
}

export function resolveYutimeStartChodama({ startAction, stores, storeId, currentChodama }) {
  if (startAction === "start") return resolveRecordStartChodama(stores, storeId, null);
  if (startAction === "replace") return resolveRecordStartChodama(stores, storeId, currentChodama ?? 0);
  return null;
}
export function resolveRecordStartRentBallsContext({ selectionRentBalls, storeRentBalls, appRentBalls } = {}) {
  const selectionPresent = selectionRentBalls !== undefined && selectionRentBalls !== null && selectionRentBalls !== "";
  if (selectionPresent && isValidRentBalls(selectionRentBalls)) return { value: Number(selectionRentBalls), source: "selection", warning: false, commitOnStart: true };
  const storePresent = storeRentBalls !== undefined && storeRentBalls !== null && storeRentBalls !== "";
  if (storePresent && isValidRentBalls(storeRentBalls)) return { value: Number(storeRentBalls), source: "store", warning: selectionPresent, commitOnStart: true };
  if (isValidRentBalls(appRentBalls)) return { value: Number(appRentBalls), source: selectionPresent || storePresent ? "store-fallback-app" : "app", warning: selectionPresent || storePresent, commitOnStart: false };
  return { value: DEFAULT_RENT_BALLS, source: "app-fallback", warning: true, commitOnStart: false };
}

export function normalizeRecordStartRentBallsContext(context, { appRentBalls, appWarning } = {}) {
  const source = context?.source;
  const value = context?.value;
  if ((source === "selection" || source === "store") && isValidRentBalls(value)) {
    return { value: Number(value), source, warning: false, commitOnStart: true };
  }
  if (source === "app-fallback") return { value: DEFAULT_RENT_BALLS, source, warning: true, commitOnStart: false };
  if (source === "store-fallback-app" && isValidRentBalls(appRentBalls)) {
    return { value: Number(appRentBalls), source, warning: true, commitOnStart: false };
  }
  if (source === "app" && isValidRentBalls(value)) {
    return { value: Number(value), source, warning: !!context.warning || !!appWarning, commitOnStart: false };
  }
  if (isValidRentBalls(appRentBalls)) return { value: Number(appRentBalls), source: "app", warning: true, commitOnStart: false };
  return { value: DEFAULT_RENT_BALLS, source: "app-fallback", warning: true, commitOnStart: false };
}
