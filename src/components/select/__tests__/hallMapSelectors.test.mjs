// src/components/select/__tests__/hallMapSelectors.test.mjs
// 実行: node src/components/select/__tests__/hallMapSelectors.test.mjs

import assert from "node:assert";
import {
  normalizeIsland,
  normalizeIslands,
  getStoreIslands,
  setStoreIslands,
  islandCount,
  addIsland,
  removeIsland,
  updateIsland,
  moveIslandUp,
  moveIslandDown,
} from "../hallMapSelectors.js";

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

test("空・不正入力でも破綻しない", () => {
  assert.deepStrictEqual(normalizeIslands(null), []);
  assert.deepStrictEqual(normalizeIslands(undefined), []);
  assert.deepStrictEqual(getStoreIslands(null, 1), []);
  assert.deepStrictEqual(getStoreIslands({}, null), []);
});

test("normalizeIsland は範囲を昇順・0以上に揃える", () => {
  const a = normalizeIsland({ start: 50, end: 41, name: "A", machineName: "X" });
  assert.strictEqual(a.start, 41);
  assert.strictEqual(a.end, 50);
  const b = normalizeIsland({ start: -5, end: -1 });
  assert.strictEqual(b.start, 0);
  assert.strictEqual(b.end, 0);
});

test("normalizeIsland は id を保持し欠落時は生成する", () => {
  const a = normalizeIsland({ id: "keep-me", start: 1, end: 2 });
  assert.strictEqual(a.id, "keep-me");
  const b = normalizeIsland({ start: 1, end: 2 });
  assert.ok(typeof b.id === "string" && b.id.length > 0);
});

test("islandCount は range の台数を返す", () => {
  assert.strictEqual(islandCount({ start: 1, end: 10 }), 10);
  assert.strictEqual(islandCount({ start: 5, end: 5 }), 1);
  // 範囲逆転は正規化されて1以上になる
  assert.strictEqual(islandCount({ start: 10, end: 1 }), 10);
});

test("getStoreIslands は number/string 両キーで引ける", () => {
  const maps = { "123": [{ id: "i1", name: "1島", start: 1, end: 10, machineName: "甘デジ" }] };
  assert.strictEqual(getStoreIslands(maps, 123).length, 1);
  assert.strictEqual(getStoreIslands(maps, "123").length, 1);
  assert.strictEqual(getStoreIslands(maps, 999).length, 0);
});

test("setStoreIslands は不変更新し他店舗を壊さない", () => {
  const maps = { "1": [{ id: "a", name: "x", start: 1, end: 2, machineName: "" }] };
  const next = setStoreIslands(maps, 2, [{ id: "b", name: "y", start: 3, end: 4, machineName: "" }]);
  assert.notStrictEqual(next, maps);
  assert.strictEqual(getStoreIslands(next, 1).length, 1);
  assert.strictEqual(getStoreIslands(next, 2).length, 1);
  // 元オブジェクトは不変
  assert.strictEqual(Object.keys(maps).length, 1);
});

test("setStoreIslands は空配列でキーを削除する", () => {
  const maps = { "1": [{ id: "a", name: "x", start: 1, end: 2, machineName: "" }] };
  const next = setStoreIslands(maps, 1, []);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(next, "1"), false);
});

test("addIsland は末尾に続き番号で追加する", () => {
  let list = [];
  list = addIsland(list);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].start, 1);
  assert.strictEqual(list[0].end, 10);
  list = addIsland(list);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[1].start, 11);
});

test("removeIsland は id 指定で削除する", () => {
  const list = [
    { id: "a", name: "1", start: 1, end: 2, machineName: "" },
    { id: "b", name: "2", start: 3, end: 4, machineName: "" },
  ];
  const next = removeIsland(list, "a");
  assert.strictEqual(next.length, 1);
  assert.strictEqual(next[0].id, "b");
});

test("updateIsland は対象のみ部分更新する", () => {
  const list = [
    { id: "a", name: "1", start: 1, end: 2, machineName: "" },
    { id: "b", name: "2", start: 3, end: 4, machineName: "" },
  ];
  const next = updateIsland(list, "b", { machineName: "海物語", end: 10 });
  assert.strictEqual(next[0].machineName, "");
  assert.strictEqual(next[1].machineName, "海物語");
  assert.strictEqual(next[1].end, 10);
});

test("moveIslandUp/Down は順序を入れ替える（端では不変）", () => {
  const list = [
    { id: "a", name: "1", start: 1, end: 2, machineName: "" },
    { id: "b", name: "2", start: 3, end: 4, machineName: "" },
    { id: "c", name: "3", start: 5, end: 6, machineName: "" },
  ];
  const up = moveIslandUp(list, "c");
  assert.deepStrictEqual(up.map((x) => x.id), ["a", "c", "b"]);
  const down = moveIslandDown(list, "a");
  assert.deepStrictEqual(down.map((x) => x.id), ["b", "a", "c"]);
  // 端は不変
  assert.deepStrictEqual(moveIslandUp(list, "a").map((x) => x.id), ["a", "b", "c"]);
  assert.deepStrictEqual(moveIslandDown(list, "c").map((x) => x.id), ["a", "b", "c"]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
