const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export function isTimeValue(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

export function timeValueFromDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function deadlineFromTime(referenceAt, timeValue, { allowNextDay = false } = {}) {
  if (!isTimeValue(timeValue)) return null;
  const reference = new Date(referenceAt);
  if (!Number.isFinite(reference.getTime())) return null;
  const [hours, minutes] = timeValue.split(":").map(Number);
  const deadline = new Date(reference);
  deadline.setHours(hours, minutes, 0, 0);
  if (deadline.getTime() <= reference.getTime()) {
    if (!allowNextDay) return null;
    deadline.setDate(deadline.getDate() + 1);
  }
  return deadline;
}

export function validateSessionSchedule({
  nowAt,
  targetTime,
  closingTime,
  sessionStartedAt = nowAt,
}) {
  const now = new Date(nowAt);
  if (!Number.isFinite(now.getTime())) {
    return { ok: false, error: "invalid_now", targetDeadline: null, closingDeadline: null };
  }

  const targetDeadline = deadlineFromTime(now, targetTime);
  if (!targetDeadline) {
    return { ok: false, error: "target_not_future", targetDeadline: null, closingDeadline: null };
  }

  if (!isTimeValue(closingTime)) {
    return { ok: false, error: "closing_missing", targetDeadline, closingDeadline: null };
  }

  const closingReference = new Date(sessionStartedAt);
  const closingDeadline = deadlineFromTime(
    Number.isFinite(closingReference.getTime()) ? closingReference : now,
    closingTime,
    { allowNextDay: true },
  );
  if (!closingDeadline) {
    return { ok: false, error: "closing_invalid", targetDeadline, closingDeadline: null };
  }

  if (targetDeadline > closingDeadline) {
    return { ok: false, error: "target_after_closing", targetDeadline, closingDeadline };
  }

  return { ok: true, error: null, targetDeadline, closingDeadline };
}

export function projectWorkToDeadline({ currentWork = 0, hourlyWork = 0, nowAt, deadlineAt }) {
  const now = new Date(nowAt);
  const deadline = new Date(deadlineAt);
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(deadline.getTime())) return null;
  const remainingMs = deadline.getTime() - now.getTime();
  if (remainingMs < 0) return null;
  const remainingMinutes = Math.floor(remainingMs / 60000);
  const remainingHours = remainingMs / 3600000;
  const addedWork = finite(hourlyWork) * remainingHours;
  return {
    remainingMinutes,
    remainingHours,
    addedWork,
    totalWork: finite(currentWork) + addedWork,
  };
}

export function estimateHourlyWorkFromStart1K({
  start1K,
  synthDenom,
  spec1R,
  specAvgRounds,
  specSapo = 0,
  exRate,
  rentBalls,
  rotPerHour,
  playMode = "cash",
}) {
  const start = finite(start1K);
  const denominator = finite(synthDenom);
  const exchangeBalls = finite(exRate);
  const rentalBalls = finite(rentBalls);
  const rotationsPerHour = finite(rotPerHour);
  if (start <= 0 || denominator <= 0 || exchangeBalls <= 0 || rentalBalls <= 0 || rotationsPerHour <= 0) return null;

  const roundOutput = finite(spec1R);
  const averageRounds = finite(specAvgRounds);
  if (roundOutput <= 0 || averageRounds <= 0) return null;
  const averageNetBalls = roundOutput * averageRounds + finite(specSapo);
  const grossYenPerK = (start / denominator) * averageNetBalls * (1000 / exchangeBalls);
  const costPerK = playMode === "cash" ? 1000 : 1000 * exchangeBalls / rentalBalls;
  const expectedYenPerK = grossYenPerK - costPerK;
  const expectedYenPerRotation = expectedYenPerK / start;
  return {
    expectedYenPerK,
    expectedYenPerRotation,
    hourlyWork: expectedYenPerRotation * rotationsPerHour,
  };
}

export function calculateLiveActualBalance({
  currentMochiBalls = 0,
  currentChodama = 0,
  initialChodama = 0,
  rawInvest = 0,
  carriedInYen = 0,
  ballValueYen = 0,
}) {
  const ballValue = Math.max(0, finite(ballValueYen));
  const currentHeldValue = Math.max(0, finite(currentMochiBalls)) * ballValue;
  const storedBallChangeValue = (finite(currentChodama) - finite(initialChodama)) * ballValue;
  return Math.round(
    currentHeldValue
    + storedBallChangeValue
    - Math.max(0, finite(rawInvest))
    - Math.max(0, finite(carriedInYen)),
  );
}
