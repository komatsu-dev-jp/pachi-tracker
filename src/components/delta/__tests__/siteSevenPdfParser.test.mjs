import { test } from "node:test";
import assert from "node:assert/strict";
import { groupPdfTextItems, parseSiteSevenTextPages } from "../siteSevenPdfParser.js";

function item(str, x, y) {
  return { str, transform: [1, 0, 0, 1, x, y] };
}

function siteSevenHeader(y = 160) {
  return [
    item("台番", 60, y),
    item("累計スタート", 117, y),
    item("通常中スタート", 177, y),
    item("初当り回数", 244, y),
    item("最高出玉", 296, y),
    item("大当り回数", 363, y),
  ];
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
    ...siteSevenHeader(),
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
    ...siteSevenHeader(),
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
    { pageNumber: 1, items: [...siteSevenHeader(), item("P機種A", 104, 130), ...data(10)] },
    { pageNumber: 2, items: [...siteSevenHeader(), item("P機種B", 104, 130), ...data(20)] },
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].normalSpins, 20);
  assert.equal(result.rows[0].machineName, "P機種B");
  assert.deepEqual(result.duplicates, [{ num: "401", pageNumber: 2 }]);
});

test("parseSiteSevenTextPages: 6列に欠ける台行はスキップ理由を残す", () => {
  const result = parseSiteSevenTextPages([{
    pageNumber: 3,
    items: [...siteSevenHeader(), item("401", 60, 100), item("100", 117, 100), item("90", 177, 100)],
  }]);
  assert.equal(result.rows.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, "6列の数値として読み取れない");
});

test("parseSiteSevenTextPages: PDF.jsが数字を1文字ずつ分割しても見出し座標から6列を復元する", () => {
  const splitNumber = (value, x, y) => String(value)
    .split("")
    .map((digit, index) => item(digit, x + index * 6, y + (index % 2 ? 0.3 : 0)));
  const result = parseSiteSevenTextPages([{
    pageNumber: 1,
    items: [
      ...siteSevenHeader(),
      item("P東京喰種", 104, 130),
      ...splitNumber("479", 60, 100),
      ...splitNumber("1912", 117, 100),
      ...splitNumber("1104", 177, 100),
      ...splitNumber("3", 244, 100),
      ...splitNumber("17370", 296, 100),
      ...splitNumber("14", 363, 100),
    ],
  }]);

  assert.equal(result.rows.length, 1);
  assert.deepEqual(
    {
      num: result.rows[0].num,
      cumulativeStarts: result.rows[0].cumulativeStarts,
      normalSpins: result.rows[0].normalSpins,
      firstHitCount: result.rows[0].firstHitCount,
      maxPayout: result.rows[0].maxPayout,
      totalStarts: result.rows[0].totalStarts,
    },
    {
      num: "479",
      cumulativeStarts: 1912,
      normalSpins: 1104,
      firstHitCount: 3,
      maxPayout: 17370,
      totalStarts: 14,
    },
  );
  assert.equal(result.skipped.length, 0);
});

test("parseSiteSevenTextPages: サイトセブン見出しのない6数値行を台データとして自動採用しない", () => {
  const result = parseSiteSevenTextPages([{
    pageNumber: 1,
    items: [
      item("479", 60, 100),
      item("1912", 117, 100),
      item("1104", 177, 100),
      item("3", 244, 100),
      item("17370", 296, 100),
      item("14", 363, 100),
    ],
  }]);

  assert.equal(result.rows.length, 0);
  assert.equal(result.schemaDetected, false);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, "サイトセブン6列見出しを確認できない");
});

test("parseSiteSevenTextPages: 列ずれで通常中スタートが累計を超えた行は確定しない", () => {
  const result = parseSiteSevenTextPages([{
    pageNumber: 1,
    items: [
      ...siteSevenHeader(),
      item("479", 60, 100),
      item("1104", 117, 100),
      item("1912", 177, 100),
      item("3", 244, 100),
      item("17370", 296, 100),
      item("14", 363, 100),
    ],
  }]);

  assert.equal(result.rows.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, "6列の値の整合性を確認できない");
});

test("parseSiteSevenTextPages: 分割数字の行で列が欠けても要確認件数から消さない", () => {
  const result = parseSiteSevenTextPages([{
    pageNumber: 1,
    items: [
      ...siteSevenHeader(),
      item("4", 60, 100),
      item("7", 66, 100),
      item("9", 72, 100),
      item("1912", 117, 100),
      item("1104", 177, 100),
      item("3", 244, 100),
      // 最高出玉の列が欠落
      item("14", 363, 100),
    ],
  }]);

  assert.equal(result.rows.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.autoAcceptable, false);
  assert.equal(result.skipped[0].text, "4 7 9 1912 1104 3 14");
});

test("parseSiteSevenTextPages: does not shift a missing column into an unrelated trailing number", () => {
  const result = parseSiteSevenTextPages([{
    pageNumber: 1,
    items: [
      ...siteSevenHeader(),
      item("479", 60, 100),
      item("1912", 117, 100),
      item("1104", 177, 100),
      item("3", 244, 100),
      // maxPayout at x=296 is intentionally missing.
      item("14", 363, 100),
      // A table-external number must not be consumed as totalStarts.
      item("999", 430, 100),
    ],
  }]);

  assert.equal(result.rows.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.autoAcceptable, false);
  assert.equal(result.skipped[0].text, "479 1912 1104 3 14 999");
});

test("parseSiteSevenTextPages: 文字のないPDFと表ではない文字PDFを区別する", () => {
  const imageOnly = parseSiteSevenTextPages([{ pageNumber: 1, items: [] }]);
  const otherText = parseSiteSevenTextPages([{
    pageNumber: 1,
    items: [item("サイトセブンのグラフ画像", 40, 100)],
  }]);

  assert.equal(imageOnly.extractionMode, "image-only");
  assert.equal(imageOnly.autoAcceptable, false);
  assert.equal(otherText.extractionMode, "unrecognized-text");
  assert.equal(otherText.autoAcceptable, false);
});

test("parseSiteSevenTextPages: 複数ページに続く同一機種のrelationを保持する", () => {
  const row = (num, y = 100) => [
    item(String(num), 60, y),
    item("100", 117, y),
    item("90", 177, y),
    item("1", 244, y),
    item("1500", 296, y),
    item("2", 363, y),
  ];
  const result = parseSiteSevenTextPages([
    {
      pageNumber: 1,
      items: [...siteSevenHeader(), item("e東京喰種", 104, 130), ...row(479)],
    },
    {
      pageNumber: 2,
      // 2ページ目に機種名・見出しが再掲されないPDFでも、前ページのschemaを引き継ぐ。
      items: row(480),
    },
  ]);

  assert.deepEqual(result.rows.map(({ num, machineName, sourcePage }) => ({
    num,
    machineName,
    sourcePage,
  })), [
    { num: "479", machineName: "e東京喰種", sourcePage: 1 },
    { num: "480", machineName: "e東京喰種", sourcePage: 2 },
  ]);
  assert.equal(result.autoAcceptable, true);
});

