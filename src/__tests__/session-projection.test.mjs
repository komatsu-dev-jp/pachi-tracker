import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateLiveActualBalance,
  deadlineFromTime,
  estimateHourlyWorkFromStart1K,
  isTimeValue,
  projectWorkToDeadline,
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
  assert.ok(held.hourlyWork < cash.hourlyWork);
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
