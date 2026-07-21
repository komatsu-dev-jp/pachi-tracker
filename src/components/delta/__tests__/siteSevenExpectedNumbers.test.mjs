import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStoreScopeExpectedNumbers,
} from "../siteSevenExpectedNumbers.js";

const islands = [
  { id: "b", ranges: [{ start: 546, end: 574 }] },
  { id: "a", ranges: [{ start: 479, end: 490 }, { start: 499, end: 509 }] },
];

test("店舗全体の台番号を島の登録順ではなく表の昇順へ整える", () => {
  const numbers = buildStoreScopeExpectedNumbers(islands, "all");
  assert.equal(numbers.length, 52);
  assert.deepEqual(numbers.slice(0, 4), ["479", "480", "481", "482"]);
  assert.deepEqual(numbers.slice(-3), ["572", "573", "574"]);
});

test("選択した島だけを期待台番号にする", () => {
  assert.deepEqual(
    buildStoreScopeExpectedNumbers(islands, "a"),
    [
      "479", "480", "481", "482", "483", "484", "485", "486", "487", "488", "489", "490",
      "499", "500", "501", "502", "503", "504", "505", "506", "507", "508", "509",
    ],
  );
});
