import { test } from "node:test";
import assert from "node:assert/strict";
import { groupPdfTextItems, parseSiteSevenTextPages } from "../siteSevenPdfParser.js";

function item(str, x, y) {
  return { str, transform: [1, 0, 0, 1, x, y] };
}

test("groupPdfTextItems: 少しずれた文字を同じ行にまとめる", () => {
  const lines = groupPdfTextItems([
    item("401", 60, 100),
    item("3", 124, 100.5),
    item("P北斗", 104, 130),
    item("4", 49, 129.4),
  ]);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].items.map((entry) => entry.str), ["4", "P北斗"]);
  assert.deepEqual(lines[1].items.map((entry) => entry.str), ["401", "3"]);
});

test("parseSiteSevenTextPages: 機種名と6列の台データを関連付ける", () => {
  const items = [
    item("台番", 60, 160),
    item("通常中スタート", 170, 160),
    item("4", 49, 130),
    item("P", 104, 130.6),
    item("沖ドキ！", 120, 130.6),
    item("LG", 200, 130.6),
    item("401", 60, 100),
    item("3", 124, 100.4),
    item("3", 184, 100.4),
    item("0", 244, 100.4),
    item("10", 300, 100.4),
    item("0", 363, 100.4),
  ];
  const result = parseSiteSevenTextPages([{ pageNumber: 1, items }], {
    dateText: "2026/07/17",
    storeName: "スーパーキスケPAO",
  });

  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], {
    date: "2026/07/17",
    store: "スーパーキスケPAO",
    island: "P沖ドキ！LG島",
    machineName: "P沖ドキ！LG",
    num: "401",
    cumulativeStarts: 3,
    normalSpins: 3,
    firstHitCount: 0,
    maxPayout: 10,
    totalStarts: 0,
    sourcePage: 1,
  });
  assert.equal(result.skipped.length, 0);
});

test("parseSiteSevenTextPages: 全角数字とカンマを数値化する", () => {
  const items = [
    item("4", 49, 130),
    item("P北斗の拳", 104, 130),
    item("４０２", 60, 100),
    item("1,２３４", 117, 100),
    item("１，２００", 177, 100),
    item("３", 244, 100),
    item("5,６７８", 296, 100),
    item("１２", 363, 100),
  ];
  const { rows } = parseSiteSevenTextPages([{ pageNumber: 1, items }]);
  assert.equal(rows[0].num, "402");
  assert.equal(rows[0].normalSpins, 1200);
  assert.equal(rows[0].totalStarts, 12);
  assert.equal(rows[0].maxPayout, 5678);
});

test("parseSiteSevenTextPages: 重複台番号は後のページを採用して警告する", () => {
  const data = (normalSpins, y = 100) => [
    item("401", 60, y),
    item(String(normalSpins), 117, y),
    item(String(normalSpins), 177, y),
    item("0", 244, y),
    item("10", 296, y),
    item("0", 363, y),
  ];
  const result = parseSiteSevenTextPages([
    { pageNumber: 1, items: [item("P機種A", 104, 130), ...data(10)] },
    { pageNumber: 2, items: [item("P機種B", 104, 130), ...data(20)] },
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].normalSpins, 20);
  assert.equal(result.rows[0].machineName, "P機種B");
  assert.deepEqual(result.duplicates, [{ num: "401", pageNumber: 2 }]);
});

test("parseSiteSevenTextPages: 6列に欠ける台行はスキップ理由を残す", () => {
  const result = parseSiteSevenTextPages([{
    pageNumber: 3,
    items: [item("401", 60, 100), item("100", 117, 100), item("90", 177, 100)],
  }]);
  assert.equal(result.rows.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, "6列の数値として読み取れない");
});

