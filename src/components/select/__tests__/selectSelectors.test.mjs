// src/components/select/__tests__/selectSelectors.test.mjs
// 実行: node src/components/select/__tests__/selectSelectors.test.mjs

import assert from "node:assert";
import {
  filterMachines,
  getGoodMachineCandidates,
  normalizeMachineRows,
  summarizeIsland,
} from "../selectSelectors.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL [${name}]: ${e.message}`);
    failed++;
  }
}

test("空配列でも破綻しない", () => {
  assert.deepStrictEqual(normalizeMachineRows(null), []);
  assert.deepStrictEqual(filterMachines([], "candidates"), []);
  assert.strictEqual(summarizeIsland([]).total, 0);
});

test("confidence は 0-100 に丸める", () => {
  const rows = normalizeMachineRows([{ machineNumber: 1, confidence: 130, borderDiff: 1 }]);
  assert.strictEqual(rows[0].confidence, 100);
});

test("verdict欠損時もP-EVIDENCEと同じscore境界を使う", () => {
  const rows = normalizeMachineRows([
    { machineNumber: 1, confidence: 25, borderDiff: 0.6 },
    { machineNumber: 2, confidence: 100, borderDiff: 0.6 },
    { machineNumber: 3, confidence: 19, borderDiff: 10 },
    { machineNumber: 4, confidence: 19.9, borderDiff: 10, score: 999 },
  ]);
  assert.deepStrictEqual(rows.map((row) => row.verdict), ["watch", "strong", "nodata", "nodata"]);
});

test("良台候補フィルタは strong/good のみ", () => {
  const rows = [
    { machineNumber: 1, confidence: 90, borderDiff: 3, verdict: "strong" },
    { machineNumber: 2, confidence: 70, borderDiff: 1, verdict: "good" },
    { machineNumber: 3, confidence: 50, borderDiff: 0, verdict: "watch" },
    { machineNumber: 4, confidence: 20, borderDiff: -2, verdict: "avoid" },
  ];
  assert.deepStrictEqual(filterMachines(rows, "candidates").map((r) => r.machineNumber), [1, 2]);
});

test("実戦中フィルタは isPlaying のみ", () => {
  const rows = [
    { machineNumber: 1, isPlaying: false },
    { machineNumber: 2, isPlaying: true },
  ];
  assert.deepStrictEqual(filterMachines(rows, "playing").map((r) => r.machineNumber), [2]);
});

test("TOP5 はスコア降順で limit が効く", () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({
    machineNumber: i + 1,
    confidence: 40 + i * 6,
    borderDiff: i / 2,
    evPerK: i * 100,
    verdict: i > 3 ? "good" : "watch",
  }));
  const top = getGoodMachineCandidates(rows, 5);
  assert.strictEqual(top.length, 5);
  assert.strictEqual(top[0].machineNumber, 8);
  assert.deepStrictEqual(top.map((r) => r.rank), [1, 2, 3, 4, 5]);
});

test("島サマリーを返す", () => {
  const s = summarizeIsland([
    { machineNumber: 1, confidence: 80, borderDiff: 3, verdict: "strong", isPlaying: true },
    { machineNumber: 2, confidence: 40, borderDiff: -1, verdict: "avoid" },
  ]);
  assert.strictEqual(s.total, 2);
  assert.strictEqual(s.candidates, 1);
  assert.strictEqual(s.playing, 1);
  assert.strictEqual(s.averageConfidence, 60);
  assert.strictEqual(s.best.machineNumber, 1);
});

if (failed === 0) {
  console.log(`OK: ${passed} tests passed`);
  process.exit(0);
} else {
  console.error(`NG: ${failed} test(s) failed (${passed} passed)`);
  process.exit(1);
}
