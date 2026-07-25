import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCashLimitPreAlert,
  calculateDailyCashSpent,
  calculateLiveActualBalance,
  deadlineFromTime,
  estimateHourlyWorkFromStart1K,
  isTimeValue,
  projectCashLimit,
  projectWorkToDeadline,
  rotationPer250FromStart1K,
  timeValueFromDate,
  validateSessionSchedule,
} from "../sessionProjection.js";

test("time helpers validate and format local HH:mm values", () => {
  assert.equal(isTimeValue("23:00"), true);
  assert.equal(isTimeValue("24:00"), false);
  assert.equal(timeValueFromDate(new Date(2026, 6, 16, 9, 5)), "09:05");
});

test("deadlineFromTime rejects a past same-day time", () => {
  const now = new Date(2026, 6, 16, 20, 0);
  assert.equal(deadlineFromTime(now, "19:30"), null);
  assert.equal(deadlineFromTime(now, "21:30").getTime(), new Date(2026, 6, 16, 21, 30).getTime());
});

test("deadlineFromTime can represent an overnight closing time", () => {
  const now = new Date(2026, 6, 16, 23, 30);
  assert.equal(
    deadlineFromTime(now, "01:00", { allowNextDay: true }).getTime(),
    new Date(2026, 6, 17, 1, 0).getTime(),
  );
});

test("session schedule rejects a target time before the current time", () => {
  const result = validateSessionSchedule({
    nowAt: new Date(2026, 6, 16, 20, 0),
    targetTime: "19:30",
    closingTime: "23:00",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "target_not_future");
});

test("session schedule allows the target and closing time to be equal", () => {
  const result = validateSessionSchedule({
    nowAt: new Date(2026, 6, 16, 20, 0),
    targetTime: "23:00",
    closingTime: "23:00",
  });
  assert.equal(result.ok, true);
  assert.equal(result.targetDeadline.getTime(), result.closingDeadline.getTime());
});

test("session schedule rejects a target after closing", () => {
  const result = validateSessionSchedule({
    nowAt: new Date(2026, 6, 16, 20, 0),
    targetTime: "23:30",
    closingTime: "23:00",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "target_after_closing");
});

test("session schedule requires a closing time", () => {
  const result = validateSessionSchedule({
    nowAt: new Date(2026, 6, 16, 20, 0),
    targetTime: "22:00",
    closingTime: "",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "closing_missing");
});

test("projectWorkToDeadline adds only the remaining time", () => {
  const result = projectWorkToDeadline({
    currentWork: 2174,
    hourlyWork: 2470,
    nowAt: new Date(2026, 6, 16, 20, 0),
    deadlineAt: new Date(2026, 6, 16, 22, 30),
  });
  assert.equal(result.remainingMinutes, 150);
  assert.equal(result.addedWork, 6175);
  assert.equal(result.totalWork, 8349);
});

test("projectWorkToDeadline preserves negative expected hourly work", () => {
  const result = projectWorkToDeadline({
    currentWork: -500,
    hourlyWork: -1000,
    nowAt: new Date(2026, 6, 16, 20, 0),
    deadlineAt: new Date(2026, 6, 16, 21, 0),
  });
  assert.equal(result.totalWork, -1500);
});

test("pre-session hourly estimate uses the selected play mode cost", () => {
  const common = {
    start1K: 20,
    synthDenom: 319.6,
    spec1R: 140,
    specAvgRounds: 34.17,
    specSapo: 0,
    exRate: 28,
    rentBalls: 25,
    rotPerHour: 250,
  };
  const cash = estimateHourlyWorkFromStart1K({ ...common, playMode: "cash" });
  const held = estimateHourlyWorkFromStart1K({ ...common, playMode: "chodama" });
  assert.ok(cash);
  assert.ok(held);
  assert.ok(held.hourlyWork > cash.hourlyWork, "非等価では持ち玉の交換価値コストが現金より低い");
});

test("pre-session estimate does not use fixed fallback payout assumptions", () => {
  assert.equal(estimateHourlyWorkFromStart1K({
    start1K: 20,
    synthDenom: 319.6,
    spec1R: 0,
    specAvgRounds: 0,
    exRate: 28,
    rentBalls: 25,
    rotPerHour: 250,
  }), null);
});

test("pre-session estimate keeps a negative hourly expectation negative", () => {
  const result = estimateHourlyWorkFromStart1K({
    start1K: 10,
    synthDenom: 319.6,
    spec1R: 140,
    specAvgRounds: 5,
    specSapo: 0,
    exRate: 28,
    rentBalls: 25,
    rotPerHour: 250,
    playMode: "cash",
  });
  assert.ok(result);
  assert.ok(result.hourlyWork < 0);
});

test("live actual balance includes stored-ball use and carried-in value", () => {
  assert.equal(calculateLiveActualBalance({
    currentMochiBalls: 1000,
    currentChodama: 2250,
    initialChodama: 2500,
    rawInvest: 1000,
    carriedInYen: 2000,
    ballValueYen: 4,
  }), 0);
});

test("using stored balls without a return is a loss", () => {
  assert.equal(calculateLiveActualBalance({
    currentChodama: 2250,
    initialChodama: 2500,
    ballValueYen: 4,
  }), -1000);
});

test("mixed cash and stored-ball play counts both costs", () => {
  assert.equal(calculateLiveActualBalance({
    currentChodama: 2250,
    initialChodama: 2500,
    rawInvest: 1000,
    ballValueYen: 4,
  }), -2000);
});

test("table-move carry-in value is not counted as free profit", () => {
  assert.equal(calculateLiveActualBalance({
    currentMochiBalls: 500,
    carriedInYen: 2000,
    ballValueYen: 4,
  }), 0);
});

test("cash limit projects remaining cash into physical balls, spins, and time", () => {
  assert.deepEqual(projectCashLimit({
    cashLimit: 30000,
    rawInvest: 10000,
    rotationPer250: 20,
    rentBalls: 250,
    spinsPerHour: 250,
    playMode: "cash",
  }), {
    status: "remaining",
    calculationStatus: "ready",
    cashLimit: 30000,
    cashSpent: 10000,
    remainingCash: 20000,
    overBy: 0,
    purchasableBalls: 5000,
    remainingSpins: 400,
    remainingHours: 1.6,
    usesCashNow: true,
    shouldStop: false,
  });
});

test("cash limit uses the actual low-loan ball count", () => {
  const result = projectCashLimit({
    cashLimit: 10000,
    rawInvest: 2000,
    rotationPer250: 18,
    rentBalls: 1000,
    spinsPerHour: 240,
    playMode: "cash",
  });
  assert.equal(result.purchasableBalls, 8000);
  assert.equal(result.remainingSpins, 576);
  assert.equal(result.remainingHours, 2.4);
});

test("cash limit reports a missing rotation projection for zero rotation", () => {
  const result = projectCashLimit({
    cashLimit: 10000,
    rawInvest: 1000,
    rotationPer250: 0,
    rentBalls: 250,
    spinsPerHour: 250,
  });
  assert.equal(result.calculationStatus, "rotation-missing");
  assert.equal(result.purchasableBalls, 2250);
  assert.equal(result.remainingSpins, null);
  assert.equal(result.remainingHours, null);
});

test("cash limit stops at the limit without reporting an overage", () => {
  const result = projectCashLimit({
    cashLimit: 10000,
    rawInvest: 10000,
    rotationPer250: 20,
    rentBalls: 250,
    spinsPerHour: 250,
  });
  assert.equal(result.status, "limit_reached");
  assert.equal(result.remainingCash, 0);
  assert.equal(result.overBy, 0);
  assert.equal(result.shouldStop, true);
});

test("cash limit reports overspend and keeps held-ball play separate", () => {
  const result = projectCashLimit({
    cashLimit: 10000,
    rawInvest: 12000,
    rotationPer250: 20,
    rentBalls: 250,
    spinsPerHour: 250,
    playMode: "chodama",
  });
  assert.equal(result.status, "over_limit");
  assert.equal(result.cashSpent, 12000);
  assert.equal(result.remainingCash, 0);
  assert.equal(result.overBy, 2000);
  assert.equal(result.usesCashNow, false);
  assert.equal(result.shouldStop, true);
});

test("cash limit stays unset without creating a stop decision", () => {
  const result = projectCashLimit({
    cashLimit: 0,
    rawInvest: 12000,
    rotationPer250: 20,
    rentBalls: 250,
    spinsPerHour: 250,
  });
  assert.equal(result.status, "unset");
  assert.equal(result.calculationStatus, "unset");
  assert.equal(result.cashSpent, 12000);
  assert.equal(result.remainingCash, null);
  assert.equal(result.shouldStop, false);
});

test("daily cash spent keeps same-day table moves and Yutime support cash in one total", () => {
  assert.equal(calculateDailyCashSpent({
    date: "2026-07-25",
    archives: [
      {
        date: "2026-07-25",
        stats: { rawInvest: 4000, cashKCount: 3 },
        yutimeRuns: [{ supportCashYen: 1000 }],
      },
      {
        date: "2026/07/25",
        stats: { rawInvest: 2000, cashKCount: 3 },
        yutimeRuns: [{ supportCashYen: 500 }, { supportCashYen: -1000 }],
      },
      {
        date: "2026-07-24",
        stats: { rawInvest: 99999, cashKCount: 99 },
        yutimeRuns: [{ supportCashYen: 99999 }],
      },
    ],
    currentRawInvest: 2000,
    currentYutimeRuns: [{ supportCashYen: 1000 }, { supportCashYen: 500 }],
  }), 12000);
});

test("cash-limit conversion and 30-minute warning work at every supported loan rate", async (t) => {
  const loanRates = [
    { label: "4 yen", rentBalls: 250, rotationPer250: 25 },
    { label: "2 yen", rentBalls: 500, rotationPer250: 12.5 },
    { label: "1 yen", rentBalls: 1000, rotationPer250: 6.25 },
    { label: "0.5 yen", rentBalls: 2000, rotationPer250: 3.125 },
  ];

  for (const rate of loanRates) {
    await t.test(rate.label, () => {
      assert.equal(rotationPer250FromStart1K(25, rate.rentBalls), rate.rotationPer250);

      const atBoundary = projectCashLimit({
        cashLimit: 30000,
        rawInvest: 25000,
        rotationPer250: rotationPer250FromStart1K(25, rate.rentBalls),
        rentBalls: rate.rentBalls,
        spinsPerHour: 250,
        playMode: "cash",
      });
      assert.equal(atBoundary.remainingSpins, 125);
      assert.equal(atBoundary.remainingHours, 0.5);
      assert.deepEqual(buildCashLimitPreAlert(atBoundary), {
        shouldAlert: true,
        kind: "approaching",
        warningMinutes: 30,
        remainingMinutes: 30,
        remainingCash: 5000,
      });

      const beforeBoundary = projectCashLimit({
        cashLimit: 30000,
        rawInvest: 24000,
        rotationPer250: rotationPer250FromStart1K(25, rate.rentBalls),
        rentBalls: rate.rentBalls,
        spinsPerHour: 250,
        playMode: "cash",
      });
      assert.equal(buildCashLimitPreAlert(beforeBoundary).shouldAlert, false);

      const reached = projectCashLimit({
        cashLimit: 30000,
        rawInvest: 30000,
        rotationPer250: rotationPer250FromStart1K(25, rate.rentBalls),
        rentBalls: rate.rentBalls,
        spinsPerHour: 250,
        playMode: "cash",
      });
      assert.equal(buildCashLimitPreAlert(reached).kind, "limit_reached");
      assert.equal(buildCashLimitPreAlert(reached).shouldAlert, true);

      const over = projectCashLimit({
        cashLimit: 30000,
        rawInvest: 31000,
        rotationPer250: rotationPer250FromStart1K(25, rate.rentBalls),
        rentBalls: rate.rentBalls,
        spinsPerHour: 250,
        playMode: "cash",
      });
      assert.equal(over.overBy, 1000);
      assert.equal(buildCashLimitPreAlert(over).kind, "limit_reached");
      assert.equal(buildCashLimitPreAlert(over).shouldAlert, true);
    });
  }
});

test("cash-limit warning is suppressed while playing with held balls", () => {
  const guide = projectCashLimit({
    cashLimit: 30000,
    rawInvest: 30000,
    rotationPer250: 20,
    rentBalls: 250,
    spinsPerHour: 250,
    playMode: "chodama",
  });
  assert.deepEqual(buildCashLimitPreAlert(guide), {
    shouldAlert: false,
    kind: "none",
    warningMinutes: 30,
    remainingMinutes: 0,
    remainingCash: 0,
  });
});
