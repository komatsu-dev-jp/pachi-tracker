// src/components/select/__tests__/hallMapSelectors.test.mjs
// 実行: node src/components/select/__tests__/hallMapSelectors.test.mjs

import assert from "node:assert";
import {
  LAYOUT_ROWS_MIN,
  LAYOUT_ROWS_MAX,
  normalizeIsland,
  normalizeIslands,
  getStoreIslands,
  setStoreIslands,
  islandCount,
  islandLayoutCells,
  islandLayoutColumns,
  addIsland,
  removeIsland,
  updateIsland,
  moveIslandUp,
  moveIslandDown,
  LAYOUT_COLS_MIN,
  LAYOUT_COLS_MAX,
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

test("normalizeIsland は cols を 1〜30 に丸め・未設定なら付与しない", () => {
  assert.strictEqual(normalizeIsland({ start: 1, end: 10 }).cols, undefined);
  assert.strictEqual(normalizeIsland({ start: 1, end: 10, cols: 20 }).cols, 20);
  assert.strictEqual(normalizeIsland({ start: 1, end: 10, cols: 999 }).cols, LAYOUT_COLS_MAX);
  assert.strictEqual(normalizeIsland({ start: 1, end: 10, cols: -3 }).cols, LAYOUT_COLS_MIN);
  assert.strictEqual(normalizeIsland({ start: 1, end: 10, cols: "abc" }).cols, undefined);
});

test("normalizeIsland は gaps（欠け台番号）を昇順・重複なしに正規化し範囲外を捨てる", () => {
  // 台番号範囲 499〜509。有効な欠けは範囲内の台番号のみ。
  const a = normalizeIsland({ start: 499, end: 509, gaps: [505, 505, 501, -1, 999] });
  assert.deepStrictEqual(a.gaps, [501, 505]);
  // 欠けなし・不正入力ではフィールド自体を付与しない
  assert.strictEqual(normalizeIsland({ start: 1, end: 10 }).gaps, undefined);
  assert.strictEqual(normalizeIsland({ start: 1, end: 10, gaps: [] }).gaps, undefined);
  assert.strictEqual(normalizeIsland({ start: 1, end: 10, gaps: "x" }).gaps, undefined);
});

test("islandCount は欠けを除いた実台数を返す", () => {
  assert.strictEqual(islandCount({ start: 499, end: 509 }), 11);
  assert.strictEqual(islandCount({ start: 499, end: 509, gaps: [505] }), 10);
  assert.strictEqual(islandCount({ start: 499, end: 509, gaps: [505, 999] }), 10); // 範囲外は無効
});

test("islandLayoutCells は欠けでも位置と番号を固定したまま並べる", () => {
  // 4/3/4 の並び（範囲12・4列想定・2行目の506が欠け）
  const cells = islandLayoutCells({ start: 499, end: 510, cols: 4, gaps: [506] });
  assert.strictEqual(cells.length, 12); // セル数は範囲そのまま
  assert.strictEqual(cells[6].num, 505);
  assert.strictEqual(cells[7].num, 506); // 欠けセルも同じ位置・同じ番号のまま
  assert.strictEqual(cells[7].gap, true);
  assert.strictEqual(cells[8].num, 507); // 他のセルは一切動かない
  assert.strictEqual(cells[11].num, 510);
  assert.strictEqual(cells.filter((c) => !c.gap).length, 11);
});

test("islandLayoutCells は maxCells で打ち切れる", () => {
  const cells = islandLayoutCells({ start: 1, end: 500 }, 200);
  assert.strictEqual(cells.length, 200);
  assert.strictEqual(cells[199].num, 200);
});

test("updateIsland で cols/gaps を保存・解除できる", () => {
  const list = [{ id: "a", name: "1島", start: 499, end: 509, machineName: "" }];
  const withLayout = updateIsland(list, "a", { cols: 20, gaps: [505] });
  assert.strictEqual(withLayout[0].cols, 20);
  assert.deepStrictEqual(withLayout[0].gaps, [505]);
  // 触らない更新では維持される
  const renamed = updateIsland(withLayout, "a", { name: "A島" });
  assert.strictEqual(renamed[0].cols, 20);
  assert.deepStrictEqual(renamed[0].gaps, [505]);
  // 空配列で欠けを全解除できる
  const cleared = updateIsland(withLayout, "a", { gaps: [] });
  assert.strictEqual(cleared[0].gaps, undefined);
});

test("normalizeIsland は rows を 1〜10 に丸め・未設定なら付与しない", () => {
  assert.strictEqual(normalizeIsland({ start: 1, end: 10 }).rows, undefined);
  assert.strictEqual(normalizeIsland({ start: 1, end: 10, rows: 2 }).rows, 2);
  assert.strictEqual(normalizeIsland({ start: 1, end: 10, rows: 99 }).rows, LAYOUT_ROWS_MAX);
  assert.strictEqual(normalizeIsland({ start: 1, end: 10, rows: 0 }).rows, LAYOUT_ROWS_MIN);
  assert.strictEqual(normalizeIsland({ start: 1, end: 10, rows: "abc" }).rows, undefined);
});

test("islandLayoutColumns は行数から横方向の列数を算出する", () => {
  // 範囲24・2行 → 12列（台は横方向に増える）
  assert.strictEqual(islandLayoutColumns({ start: 499, end: 522, rows: 2 }), 12);
  // 欠けがあってもセル数（範囲）は変わらないので列数も変わらない
  assert.strictEqual(islandLayoutColumns({ start: 499, end: 522, rows: 2, gaps: [510] }), 12);
  // rows があれば旧 cols より優先
  assert.strictEqual(islandLayoutColumns({ start: 1, end: 10, rows: 2, cols: 4 }), 5);
  // rows 未設定なら旧 cols を使う
  assert.strictEqual(islandLayoutColumns({ start: 1, end: 10, cols: 4 }), 4);
  // どちらも無ければ null
  assert.strictEqual(islandLayoutColumns({ start: 1, end: 10 }), null);
});

test("updateIsland で rows の保存と旧 cols の解除ができる", () => {
  const list = [{ id: "a", name: "1島", start: 499, end: 522, machineName: "", cols: 20 }];
  const next = updateIsland(list, "a", { rows: 2, cols: null });
  assert.strictEqual(next[0].rows, 2);
  assert.strictEqual(next[0].cols, undefined);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
