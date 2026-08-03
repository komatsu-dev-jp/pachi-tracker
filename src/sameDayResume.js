const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
const clean = (value) => String(value ?? "").trim();
const whole = (value, minimum = 0) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum ? number : null;
};

export function createOneTimeStartGuard() {
  let claimed = false;
  return { claim() { if (claimed) return false; claimed = true; return true; } };
}

export function normalizeSameDayResumeCandidate(value) {
  if (!value || typeof value !== "object" || value.version !== 1) return null;
  const candidateId = clean(value.candidateId);
  const businessDate = clean(value.businessDate);
  const createdAt = clean(value.createdAt);
  const storeId = value.storeId;
  const storeName = clean(value.storeName);
  const machineName = clean(value.machineName);
  const machineNum = clean(value.machineNum);
  const balls = whole(value.balls, 1);
  const carriedValueYen = whole(value.carriedValueYen, 0);
  if (!candidateId || !isDate(businessDate) || !createdAt || storeId == null || !storeName || !machineName || balls == null || carriedValueYen == null) return null;
  return { version: 1, candidateId, businessDate, createdAt, storeId, storeName, machineName, machineNum, balls, carriedValueYen };
}

export function isSameDayResumeExpired(candidate, businessDate) {
  const normalized = normalizeSameDayResumeCandidate(candidate);
  return !normalized || normalized.businessDate !== businessDate;
}

export function createSameDayResumeCandidate({ businessDate, createdAt, storeId, storeName, machineName, machineNum, balls, carriedValueYen, candidateId }) {
  return normalizeSameDayResumeCandidate({ version: 1, candidateId, businessDate, createdAt, storeId, storeName, machineName, machineNum, balls, carriedValueYen });
}

export function canCreateSameDayResumeCandidate({ storeId, storeName, machineName, balls }) {
  return storeId != null
    && clean(storeName) !== ""
    && clean(machineName) !== ""
    && whole(balls, 1) != null;
}

export function resolveSameDayResumeSettlement({ method, candidateInput }) {
  if (method !== "same_day_hold") return { canProceed: true, candidate: null };
  const candidate = createSameDayResumeCandidate(candidateInput || {});
  return { canProceed: candidate != null, candidate };
}

export function matchSameDayResumeCandidate(candidate, context) {
  const item = normalizeSameDayResumeCandidate(candidate);
  if (!item || isSameDayResumeExpired(item, clean(context?.businessDate))) return { matched: false, reason: "期限切れ" };
  if (String(item.storeId) !== String(context?.storeId ?? "")) return { matched: false, reason: "店舗が異なります" };
  if (item.machineName !== clean(context?.machineName)) return { matched: false, reason: "機種が異なります" };
  const number = clean(context?.machineNum);
  if (item.machineNum === "" && number === "") return { matched: true, fallback: true, candidate: item };
  if (!item.machineNum || !number || item.machineNum !== number) return { matched: false, reason: "台番号が異なります" };
  return { matched: true, fallback: false, candidate: item };
}

export function createSameDayResumeStart({ candidate, mode, startRot = 0, yutimeLowSpins = startRot, existingChodamaBalls = 0 }) {
  const item = normalizeSameDayResumeCandidate(candidate);
  if (!item || (mode !== "mochi" && mode !== "cash")) return null;
  const useMochi = mode === "mochi";
  const chodamaBalls = Math.max(0, Math.round(Number(existingChodamaBalls) || 0));
  return {
    playMode: mode,
    initialMochiBalls: useMochi ? item.balls : 0,
    currentMochiBalls: useMochi ? item.balls : 0,
    initialChodama: chodamaBalls,
    currentChodama: chodamaBalls,
    carriedInYen: useMochi ? item.carriedValueYen : 0,
    startRow: { type: "start", cumRot: Math.max(0, Math.round(Number(startRot) || 0)), yutimeLowSpins: Math.max(0, Math.round(Number(yutimeLowSpins) || 0)), mode, mochiBalls: useMochi ? item.balls : 0, chodamaBalls },
  };
}
