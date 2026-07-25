import assert from "node:assert/strict";
import {
  buildIslandActivityHistory,
} from "../pevidenceAnalytics.js";
import {
  buildIslandActivityCalendar,
  listIslandActivityMonths,
} from "../islandActivityCalendar.js";

function activityRow(date, kind, num) {
  const base = {
    date,
    store: "store-a",
    island: "A島",
    machineName: "P島テスト機",
    num: String(num),
  };
  if (kind === "active") {
    return {
      ...base,
      valid: true,
      inactive: false,
      activityStatus: "active",
      estimatedInputBalls: 10000,
      estimate: { normalSpins: 800 },
    };
  }
  if (kind === "inactive") {
    return {
      ...base,
      valid: false,
      inactive: true,
      activityStatus: "inactive",
      estimatedInputBalls: 0,
      estimate: { normalSpins: 0 },
    };
  }
  return {
    ...base,
    valid: false,
    inactive: false,
    activityStatus: "invalid",
    estimatedInputBalls: 0,
    estimate: { normalSpins: 300 },
  };
}

const rows = [
  activityRow("2026-06-01", "active", 101),
  activityRow("2026-06-01", "active", 102),
  activityRow("2026-06-02", "active", 101),
  activityRow("2026-06-02", "invalid", 102),
  activityRow("2026-06-03", "active", 101),
  activityRow("2026-06-03", "active", 102),
  activityRow("2026-06-03", "inactive", 103),
  activityRow("2026-06-04", "active", 101),
  activityRow("2026-06-04", "inactive", 102),
  activityRow("2026-06-04", "inactive", 103),
];

const history = buildIslandActivityHistory(rows);
assert.deepEqual(history.map((day) => [day.date, day.signalCode]), [
  ["2026-06-01", "active"],
  ["2026-06-02", "invalid"],
  ["2026-06-03", "inactive-partial"],
  ["2026-06-04", "inactive-high"],
]);

const [active, invalid, partial, high] = history;
assert.deepEqual(
  {
    scanned: active.scannedMachines,
    active: active.activeMachines,
    inactive: active.inactiveMachines,
    invalid: active.invalidMachines,
    rate: active.inactiveRate,
    rotation: active.averageRotation,
    label: active.activitySignal,
  },
  {
    scanned: 2,
    active: 2,
    inactive: 0,
    invalid: 0,
    rate: 0,
    rotation: 20,
    label: "通常稼働",
  },
);
assert.equal(invalid.invalidMachines, 1);
assert.equal(invalid.activitySignal, "読取除外あり");
assert.equal(partial.inactiveRate, 1 / 3);
assert.equal(partial.activitySignal, "一部未稼働");
assert.equal(high.inactiveRate, 2 / 3);
assert.equal(high.activitySignal, "島の未稼働が多い・調整前兆候補");

const calendarHistory = [
  { date: "2026-05-31", signalCode: "active" },
  ...history,
  { date: "2026-07-01", signalCode: "inactive-high" },
  { date: "not-a-date", signalCode: "invalid" },
];
assert.deepEqual(listIslandActivityMonths(calendarHistory), [
  "2026-05",
  "2026-06",
  "2026-07",
]);

const june = buildIslandActivityCalendar(calendarHistory, { month: "2026-06" });
assert.equal(june.month, "2026-06");
assert.equal(june.label, "2026年6月");
assert.deepEqual(june.weekdays, ["月", "火", "水", "木", "金", "土", "日"]);
assert.equal(june.hasData, true);
assert.equal(june.cells.length, 35, "2026年6月は月曜始まりで5週");
assert.equal(june.cells[0].date, "2026-06-01");
assert.equal(june.cells[0].status, "active");
assert.equal(june.cells[1].status, "invalid");
assert.equal(june.cells[2].status, "inactive-partial");
assert.equal(june.cells[3].status, "inactive-high");
assert.equal(june.cells[4].status, "no-data");
assert.equal(june.cells[4].entry, null);
assert.equal(june.cells[6].date, "2026-06-07", "列順は月曜から日曜");

const latest = buildIslandActivityCalendar(calendarHistory);
assert.equal(latest.month, "2026-07", "月未指定では最新月を選ぶ");
assert.equal(latest.cells.find((cell) => cell?.date === "2026-07-01")?.status, "inactive-high");

const emptyMonth = buildIslandActivityCalendar(calendarHistory, { month: "2026-08" });
assert.equal(emptyMonth.month, "2026-08");
assert.equal(emptyMonth.hasData, false);
assert.ok(emptyMonth.cells.every((cell) => cell === null || cell.status === "no-data"));

assert.deepEqual(buildIslandActivityCalendar([]), {
  month: "",
  label: "",
  weekdays: ["月", "火", "水", "木", "金", "土", "日"],
  availableMonths: [],
  cells: [],
  hasData: false,
});

console.log("islandActivityHistory.test.mjs: all tests passed");
