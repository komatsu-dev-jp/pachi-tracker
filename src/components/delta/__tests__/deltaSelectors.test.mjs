// src/components/delta/__tests__/deltaSelectors.test.mjs
// 実行: node --test src/components/delta/__tests__/deltaSelectors.test.mjs
//
// 差玉解析セレクタ＋ランク判定の境界値テスト。

import { test } from "node:test";
import assert from "node:assert";
import {
  parseTaiDataText,
  assignNumbers,
  mergeTaiData,
  islandToNumbers,
  buildSegmentsNumbers,
  filterGraphSlots,
  dropOverlapSlots,
  pruneScans,
} from "../deltaSelectors.js";
import { getRank, RANKS, runAnalysis } from "../deltaEngine.js";

// ──────────── parseTaiDataText ────────────

test("parseTaiData: 正常なタブ区切り2行", () => {
  const text =
    "2026/02/13\tスーパーキスケPAO\tP北斗SSPA島\tP北斗SSPA\t267\t1239\t12\n" +
    "2026/02/13\tスーパーキスケPAO\tP北斗SSPA島\tP北斗SSPA\t268\t204\t2";
  const { rows, skipped } = parseTaiDataText(text);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(skipped.length, 0);
  assert.deepStrictEqual(rows[0], {
    date: "2026/02/13",
    store: "スーパーキスケPAO",
    island: "P北斗SSPA島",
    machineName: "P北斗SSPA",
    num: "267",
    normalSpins: 1239,
    totalStarts: 12,
  });
});

test("parseTaiData: 差玉つき8列を台番号ごとに認識", () => {
  const text =
    "2026/02/13\tスーパーキスケPAO\t北斗島\tP北斗SSPA\t267\t-4,500\t1239\t12\n" +
    "2026/02/13\tスーパーキスケPAO\t北斗島\tP北斗SSPA\t268\t８２００\t204\t2";
  const { rows, skipped } = parseTaiDataText(text);
  assert.strictEqual(skipped.length, 0);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].val, -4500);
  assert.strictEqual(rows[1].val, 8200);
  assert.strictEqual(rows[0].normalSpins, 1239);
  assert.strictEqual(rows[0].totalStarts, 12);
});

test("parseTaiData: 連続空白区切りで7列になる行を再試行で拾う", () => {
  const text = "2026/02/13 店A 島A 機種A 818 1580 15";
  const { rows, skipped } = parseTaiDataText(text);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(skipped.length, 0);
  assert.strictEqual(rows[0].num, "818");
  assert.strictEqual(rows[0].normalSpins, 1580);
});

test("parseTaiData: タブと空白の混在（行ごとに方式が違う）", () => {
  const text =
    "2026/02/13\t店A\t島A\t機種A\t100\t1000\t5\n" +
    "2026/02/13 店A 島A 機種A 101 2000 8";
  const { rows } = parseTaiDataText(text);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].num, "100");
  assert.strictEqual(rows[1].num, "101");
});

test("parseTaiData: カンマ区切り数値を許容", () => {
  const text = "2026/02/13\t店A\t島A\t機種A\t818\t1,239\t12";
  const { rows } = parseTaiDataText(text);
  assert.strictEqual(rows[0].normalSpins, 1239);
});

test("parseTaiData: 全角数字を半角化", () => {
  const text = "2026/02/13\t店A\t島A\t機種A\t８１８\t１２３９\t１２";
  const { rows } = parseTaiDataText(text);
  assert.strictEqual(rows[0].num, "818");
  assert.strictEqual(rows[0].normalSpins, 1239);
  assert.strictEqual(rows[0].totalStarts, 12);
});

test("parseTaiData: 列数不足はスキップ理由付き", () => {
  const text = "2026/02/13\t店A\t島A\t機種A\t818\t1239"; // 6列
  const { rows, skipped } = parseTaiDataText(text);
  assert.strictEqual(rows.length, 0);
  assert.strictEqual(skipped.length, 1);
  assert.strictEqual(skipped[0].reason, "列数不足");
});

test("parseTaiData: 台番号が数値化できない行はスキップ", () => {
  const text = "2026/02/13\t店A\t島A\t機種A\tABC\t1239\t12";
  const { rows, skipped } = parseTaiDataText(text);
  assert.strictEqual(rows.length, 0);
  assert.strictEqual(skipped.length, 1);
  assert.strictEqual(skipped[0].reason, "台番号が数値化できない");
});

test("parseTaiData: 回転数が数値化できない行はスキップ", () => {
  const text = "2026/02/13\t店A\t島A\t機種A\t818\tーー\t12";
  const { rows, skipped } = parseTaiDataText(text);
  assert.strictEqual(rows.length, 0);
  assert.strictEqual(skipped.length, 1);
  assert.strictEqual(skipped[0].reason, "数値が数値化できない");
});

test("parseTaiData: 空文字・空行は静かに無視", () => {
  assert.deepStrictEqual(parseTaiDataText(""), { rows: [], skipped: [] });
  const { rows, skipped } = parseTaiDataText("\n\n  \n");
  assert.strictEqual(rows.length, 0);
  assert.strictEqual(skipped.length, 0);
});

// ──────────── assignNumbers ────────────

test("assignNumbers: 台番号リストを順に割り当てランク付与", () => {
  const slots = [{ val: 24500, px: 100 }, { val: -12000, px: 80 }];
  const out = assignNumbers(slots, ["818", "824"]);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].num, "818");
  assert.strictEqual(out[0].rank, "S+");
  assert.strictEqual(out[1].num, "824");
  assert.strictEqual(out[1].rank, "E+");
});

test("assignNumbers: 番号不足は index+1 フォールバック", () => {
  const out = assignNumbers([{ val: 0, px: 0 }, { val: 0, px: 0 }], ["7"]);
  assert.strictEqual(out[0].num, "7");
  assert.strictEqual(out[1].num, "2");
});

// ──────────── mergeTaiData ────────────

test("mergeTaiData: 台番号一致で回転数等をマージ", () => {
  const rows = [
    { num: "818", val: 24500, rank: getRank(24500).rank },
    { num: "824", val: -12000, rank: getRank(-12000).rank },
  ];
  const tai = [{ num: "818", island: "島A", machineName: "機種A", normalSpins: 1239, totalStarts: 12 }];
  const { rows: merged, matched } = mergeTaiData(rows, tai);
  assert.strictEqual(matched, 1);
  assert.strictEqual(merged[0].normalSpins, 1239);
  assert.strictEqual(merged[0].machineName, "機種A");
  assert.strictEqual(merged[1].normalSpins, undefined);
});

test("mergeTaiData: 不一致はマッチ0で元行を保つ", () => {
  const rows = [{ num: "1", val: 0 }];
  const tai = [{ num: "999", normalSpins: 100, totalStarts: 1 }];
  const { rows: merged, matched } = mergeTaiData(rows, tai);
  assert.strictEqual(matched, 0);
  assert.strictEqual(merged[0].val, 0);
});

test("mergeTaiData: AI差玉で既存差玉とランクを同時に更新", () => {
  const rows = [{ num: "818", val: -12000, rank: getRank(-12000).rank }];
  const tai = [{ num: "818", val: 26000, normalSpins: 1000, totalStarts: 15 }];
  const { rows: merged, matched } = mergeTaiData(rows, tai);
  assert.strictEqual(matched, 1);
  assert.strictEqual(merged[0].val, 26000);
  assert.strictEqual(merged[0].rank, getRank(26000).rank);
});

// ──────────── islandToNumbers ────────────

test("islandToNumbers: start〜end の連番", () => {
  assert.deepStrictEqual(islandToNumbers({ start: 816, end: 819 }), ["816", "817", "818", "819"]);
});

test("islandToNumbers: start>end は昇順に正規化、無効は空", () => {
  assert.deepStrictEqual(islandToNumbers({ start: 5, end: 3 }), ["3", "4", "5"]);
  assert.deepStrictEqual(islandToNumbers({}), []);
  assert.deepStrictEqual(islandToNumbers(null), []);
});

test("islandToNumbers: 複数行（飛び番）は実在の台番号だけを昇順で返す", () => {
  // 479〜490 / 509〜499（降順の行）/ 546〜548 の島。データサイトの掲載順（昇順）に揃える
  const island = { ranges: [{ start: 509, end: 499 }, { start: 479, end: 490 }, { start: 546, end: 548 }] };
  const nums = islandToNumbers(island);
  assert.strictEqual(nums.length, 12 + 11 + 3);
  assert.strictEqual(nums[0], "479");
  assert.strictEqual(nums[11], "490");
  assert.strictEqual(nums[12], "499"); // 491〜498 は存在しないので飛ぶ
  assert.strictEqual(nums[nums.length - 1], "548");
});

test("islandToNumbers: 欠け台番号は割り当て対象から除外する", () => {
  const nums = islandToNumbers({ start: 499, end: 509, gaps: [505] });
  assert.strictEqual(nums.length, 10);
  assert.ok(!nums.includes("505"));
  assert.ok(nums.includes("506"));
});

// ──────────── buildSegmentsNumbers ────────────

test("buildSegmentsNumbers: 飛び番号の複数区間", () => {
  const segs = [{ start: "901", count: "3" }, { start: "910", count: "2" }];
  assert.deepStrictEqual(buildSegmentsNumbers(segs), ["901", "902", "903", "910", "911"]);
});

test("buildSegmentsNumbers: 無効区間はスキップ", () => {
  const segs = [{ start: "", count: "3" }, { start: "5", count: "0" }, { start: "10", count: "2" }];
  assert.deepStrictEqual(buildSegmentsNumbers(segs), ["10", "11"]);
});

// ──────────── filterGraphSlots ────────────

test("filterGraphSlots: グラフ画素の無いスロットを除外し件数を返す", () => {
  // 黒帯誤検出（px:0）がページ間に挟まっても、実グラフの並びが保たれる
  const slots = [
    { val: 0, px: 0 },      // 上部黒帯（誤検出）
    { val: 0, px: 0 },
    { val: 5410, px: 320 }, // 実グラフ
    { val: -2500, px: 210 },
    { val: 0, px: 0 },      // 下部黒帯（誤検出）
    { val: 10000, px: 400 },
  ];
  const { slots: kept, skipped } = filterGraphSlots(slots);
  assert.strictEqual(skipped, 3);
  assert.deepStrictEqual(kept.map((s) => s.val), [5410, -2500, 10000]);
});

test("filterGraphSlots: 誤検出が無ければそのまま・不正入力は空", () => {
  const slots = [{ val: 500, px: 10 }, { val: -500, px: 8 }];
  const { slots: kept, skipped } = filterGraphSlots(slots);
  assert.strictEqual(skipped, 0);
  assert.strictEqual(kept.length, 2);
  assert.deepStrictEqual(filterGraphSlots(null), { slots: [], skipped: 0 });
});

test("filterGraphSlots: 除外後の割り当てで台番号がズレない", () => {
  // 黒帯2件を挟んだ4実グラフ → 除外後に 499〜502 が順番どおり割り当たる
  const raw = [
    { val: 0, px: 0 }, { val: 0, px: 0 },
    { val: 100, px: 50 }, { val: 200, px: 60 },
    { val: 300, px: 70 }, { val: 400, px: 80 },
  ];
  const { slots: kept } = filterGraphSlots(raw);
  const rows = assignNumbers(kept, ["499", "500", "501", "502"]);
  assert.deepStrictEqual(rows.map((r) => [r.num, r.val]), [
    ["499", 100], ["500", 200], ["501", 300], ["502", 400],
  ]);
});

// ──────────── dropOverlapSlots ────────────

test("dropOverlapSlots: 前画像の末尾と一致する先頭行を重複として取り除く", () => {
  const prev = [
    { val: 100, px: 50 }, { val: 200, px: 60 },
    { val: 300, px: 70 }, { val: 400, px: 80 }, // 末尾の行（重なって次画像にも写った）
  ];
  const next = [
    { val: 300, px: 70 }, { val: 400, px: 80 }, // 重複行
    { val: 500, px: 90 }, { val: 600, px: 95 },
  ];
  assert.deepStrictEqual(dropOverlapSlots(prev, next).map((s) => s.val), [500, 600]);
});

test("dropOverlapSlots: 2行分の重なりも取り除く・一致しなければそのまま", () => {
  const prev = [
    { val: 100, px: 50 }, { val: 200, px: 60 },
    { val: 300, px: 70 }, { val: 400, px: 80 },
  ];
  const next2 = [
    { val: 100, px: 50 }, { val: 200, px: 60 },
    { val: 300, px: 70 }, { val: 400, px: 80 },
    { val: 500, px: 90 }, { val: 600, px: 95 },
  ];
  assert.deepStrictEqual(dropOverlapSlots(prev, next2).map((s) => s.val), [500, 600]);
  const noMatch = [{ val: 999, px: 11 }, { val: 888, px: 12 }];
  assert.strictEqual(dropOverlapSlots(prev, noMatch).length, 2);
});

test("dropOverlapSlots: 全て空（px=0）の行の一致は偶然として取り除かない", () => {
  const prev = [{ val: 0, px: 0 }, { val: 0, px: 0 }];
  const next = [{ val: 0, px: 0 }, { val: 0, px: 0 }, { val: 500, px: 90 }, { val: 600, px: 95 }];
  assert.strictEqual(dropOverlapSlots(prev, next).length, 4);
});

// ──────────── runAnalysis（行ごと較正） ────────────

test("runAnalysis: 画像の上下端で切れた行は除外される（台番号ズレ防止）", () => {
  // 上端に切れた行（下側スライバー・黄色いラベルだけが写った状態を模擬）＋正常な行
  const w = 200, h = 600;
  const d = new Uint8ClampedArray(w * h * 4).fill(255);
  const set = (x, y, r, g, b) => { const i = (y * w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; };
  const fillRow = (y, r, g, b) => { for (let x = 0; x < w; x++) set(x, y, r, g, b); };
  // 切れた行: y=0..79（画像上端に接する・完全な行より低い）に黄色い画素あり
  for (let y = 0; y <= 79; y++) fillRow(y, 20, 20, 20);
  for (let lx = 10; lx <= 60; lx++) set(105 + lx, 40, 255, 255, 0);
  // 正常な行: y=200..430（グリッド線・ゼロ線・+10,000の黄色い線）
  for (let y = 200; y <= 430; y++) fillRow(y, 20, 20, 20);
  for (const ly of [16, 49, 82, 148, 181, 214]) fillRow(200 + ly, 90, 90, 90);
  fillRow(200 + 115, 200, 200, 200);
  for (let lx = 10; lx <= 60; lx++) set(105 + lx, 200 + 82, 255, 255, 0);

  const { results } = runAnalysis(d, w, h);
  // 切れた行はスロット自体が生成されず、正常な行の2列のみ
  assert.strictEqual(results.length, 2);
  assert.strictEqual(results[0].px, 0);      // 左列は空
  assert.strictEqual(results[1].val, 10000); // 右列は+10,000
});

test("runAnalysis: 崩れた行が混ざっても他の行の差玉が狂わない（行ごと較正）", () => {
  // 合成画像: 行A=グリッド線の無い暗帯（黒帯誤検出を模擬）、行B=正常なグラフ帯。
  // 旧実装（1行目だけで較正）では行Bの差玉が約-40,000に化けていたケース。
  const w = 200, h = 600;
  const d = new Uint8ClampedArray(w * h * 4).fill(255); // 白背景
  const set = (x, y, r, g, b) => { const i = (y * w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; };
  const fillRow = (y, r, g, b) => { for (let x = 0; x < w; x++) set(x, y, r, g, b); };
  // 行A: y=50..120 の一様な暗帯（グラフ・グリッド線なし）
  for (let y = 50; y <= 120; y++) fillRow(y, 30, 30, 30);
  // 行B: y=200..430 のグラフ帯。グリッド線6本＋明るいゼロ線（局所y=115）、間隔33px
  for (let y = 200; y <= 430; y++) fillRow(y, 20, 20, 20);
  for (const ly of [16, 49, 82, 148, 181, 214]) fillRow(200 + ly, 90, 90, 90);
  fillRow(200 + 115, 200, 200, 200); // ゼロ線
  // 行Bの右列に、ゼロ線から1グリッド上（=+10,000玉）の黄色い線を引く
  for (let lx = 10; lx <= 60; lx++) set(105 + lx, 200 + 82, 255, 255, 0);

  const { results } = runAnalysis(d, w, h);
  assert.strictEqual(results.length, 4); // 行A×2列 + 行B×2列
  assert.strictEqual(results[0].px, 0);  // 行Aはグラフ画素なし（割り当て前に除外される）
  assert.strictEqual(results[1].px, 0);
  assert.strictEqual(results[2].px, 0);  // 行Bの左列は空
  assert.strictEqual(results[3].val, 10000); // 行Bの右列は正しく+10,000
});

// ──────────── getRank 境界値 ────────────

test("getRank: 境界値 25000 は SS", () => {
  assert.strictEqual(getRank(25000).rank, "SS");
});
test("getRank: 0 は C", () => {
  assert.strictEqual(getRank(0).rank, "C");
});
test("getRank: -2500 は C-", () => {
  assert.strictEqual(getRank(-2500).rank, "C-");
});
test("getRank: 極小値は G", () => {
  assert.strictEqual(getRank(-9999999).rank, "G");
  assert.strictEqual(getRank(-Infinity).rank, "G");
});
test("getRank: 極大値は SS / RANKS は21定義", () => {
  assert.strictEqual(getRank(999999).rank, "SS");
  assert.strictEqual(RANKS.length, 21);
});

// ---- pruneScans（スキャン保持ポリシー） ----
test("pruneScans: 期限内・件数内はそのまま保持する", () => {
  const now = new Date("2026-07-14T12:00:00Z");
  const scans = [
    { id: "a", date: "2026-07-01", createdAt: "2026-07-01T10:00:00Z" },
    { id: "b", date: "2026-07-10", createdAt: "2026-07-10T10:00:00Z" },
  ];
  const result = pruneScans(scans, { now });
  assert.strictEqual(result.length, 2);
});

test("pruneScans: 90日より古いスキャンを落とす", () => {
  const now = new Date("2026-07-14T12:00:00Z");
  const scans = [
    { id: "old", date: "2026-01-01", createdAt: "2026-01-01T10:00:00Z" },
    { id: "new", date: "2026-07-10", createdAt: "2026-07-10T10:00:00Z" },
  ];
  const result = pruneScans(scans, { now });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, "new");
});

test("pruneScans: 件数超過は古い日付から落とす", () => {
  const now = new Date("2026-07-14T12:00:00Z");
  const scans = Array.from({ length: 5 }, (_, i) => ({
    id: `s${i}`,
    date: `2026-07-${String(i + 1).padStart(2, "0")}`,
    createdAt: `2026-07-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
  }));
  const result = pruneScans(scans, { now, maxCount: 3 });
  assert.strictEqual(result.length, 3);
  assert.deepStrictEqual(result.map((s) => s.id), ["s2", "s3", "s4"]);
});

test("pruneScans: 配列以外や null 要素も安全に扱う", () => {
  assert.deepStrictEqual(pruneScans(null), []);
  assert.deepStrictEqual(pruneScans([null, undefined]), []);
});
