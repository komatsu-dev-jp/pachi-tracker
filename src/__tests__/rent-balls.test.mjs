import test from "node:test";
import assert from "node:assert/strict";
import { canConfirmRentBallsFallback, isValidRentBalls, resolveRentBalls } from "../rentBalls.js";

test("内部貸玉は250〜2000の有限値だけを受け入れる", () => {
  for (const value of [250, 333, 400, 2000, "250"]) {
    assert.equal(isValidRentBalls(value), true);
    assert.equal(resolveRentBalls(value).isAbnormal, false);
  }
  for (const value of [249.9, 2000.1, 39, "", null, undefined, NaN, Infinity, -Infinity]) {
    assert.deepEqual(resolveRentBalls(value), { value: 250, isValid: false, isAbnormal: true });
  }
});

test("フォールバック確定は異常値の現在有効値だけを明示的に保存できる", () => {
  assert.equal(canConfirmRentBallsFallback({ isAbnormal: true, candidate: 250, effectiveValue: 250 }), true);
  for (const candidate of [39, 500, NaN, Infinity, () => 250]) {
    assert.equal(canConfirmRentBallsFallback({ isAbnormal: true, candidate, effectiveValue: 250 }), false);
  }
  assert.equal(canConfirmRentBallsFallback({ isAbnormal: false, candidate: 250, effectiveValue: 250 }), false);
});
