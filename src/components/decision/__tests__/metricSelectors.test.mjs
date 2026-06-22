import assert from "node:assert/strict";
import { getPredictedSpinRate } from "../metricSelectors.js";

const cases = [
  {
    name: "大当たり後も上皿補正値ではなく実測回転率を返す",
    ev: {
      start1K: 18.2,
      start1KCorrected: 37.5,
      effectiveStart1K: 37.5,
    },
    expected: 18.2,
  },
  {
    name: "実測回転率が未保存の旧データは補正値へフォールバックする",
    ev: {
      start1KCorrected: 21.4,
      effectiveStart1K: 21.4,
    },
    expected: 21.4,
  },
  {
    name: "有効な回転率がない場合は0を返す",
    ev: {},
    expected: 0,
  },
];

for (const testCase of cases) {
  assert.equal(
    getPredictedSpinRate(testCase.ev),
    testCase.expected,
    testCase.name,
  );
}

console.log(`${cases.length} passed / 0 failed`);
