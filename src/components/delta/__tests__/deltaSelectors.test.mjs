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
  validateNumberAssignment,
  validateReviewedNumberAssignment,
  isResolvedDeltaRow,
  isDeltaValueWithinConstraint,
  updateDeltaReview,
  validateDeltaRows,
  islandToNumbers,
  buildSegmentsNumbers,
  makeScan,
  pruneScans,
} from "../deltaSelectors.js";
import { getRank, RANKS } from "../deltaEngine.js";

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

test("assignNumbers: 番号不足を無関係な連番で埋めない", () => {
  const out = assignNumbers([{ val: 0, px: 0 }, { val: 0, px: 0 }], ["7"]);
  assert.strictEqual(out[0].num, "7");
  assert.strictEqual(out[1].num, "");
});

test("parseTaiData: Unicodeマイナスの符号を保持し、小数の桁結合を拒否", () => {
  const unicodeMinus = "2026/02/13\t店A\t島A\t機種A\t818\t−4,500\t1239\t12";
  const parsed = parseTaiDataText(unicodeMinus);
  assert.strictEqual(parsed.rows[0].val, -4500);

  const decimal = "2026/02/13\t店A\t島A\t機種A\t819\t12.5\t1239\t12";
  const rejected = parseTaiDataText(decimal);
  assert.strictEqual(rejected.rows.length, 0);
  assert.strictEqual(rejected.skipped[0].reason, "数値が数値化できない");
});

test("assignNumbers: 読み取り失敗のnullと診断情報を保持する", () => {
  const slot = {
    val: null,
    px: 0,
    status: "failed",
    reasonCodes: ["missing-series"],
    source: { imageIndex: 2, row: 4, column: 1 },
  };
  const [row] = assignNumbers([slot], ["814"]);
  assert.strictEqual(row.val, null);
  assert.strictEqual(row.rank, null);
  assert.strictEqual(row.status, "failed");
  assert.deepStrictEqual(row.reasonCodes, ["missing-series"]);
  assert.deepStrictEqual(row.source, slot.source);
});

test("validateNumberAssignment: 件数・空欄・重複を拒否する", () => {
  assert.strictEqual(validateNumberAssignment([{}, {}], ["810", "811"]).valid, true);
  const mismatch = validateNumberAssignment([{}, {}, {}], ["810", "810"]);
  assert.strictEqual(mismatch.valid, false);
  assert.deepStrictEqual(mismatch.errors.sort(), ["count-mismatch", "duplicate-number"]);
  const blank = validateNumberAssignment([{}], [""]);
  assert.deepStrictEqual(blank.errors, ["blank-number"]);
});

test("validateNumberAssignment: 数字以外と表記だけ異なる重複を拒否する", () => {
  const invalid = validateNumberAssignment([{}], ["ABC"]);
  assert.deepStrictEqual(invalid.errors, ["invalid-number"]);
  assert.deepStrictEqual(invalid.invalidNumberIndices, [0]);

  const duplicate = validateNumberAssignment([{}, {}], ["0810", "810"]);
  assert.deepStrictEqual(duplicate.errors, ["duplicate-number"]);
  assert.deepStrictEqual(duplicate.duplicateNumbers, ["810"]);
});

test("validateReviewedNumberAssignment: 枠ごとに合格したOCR候補だけを上書き禁止にする", () => {
  const slots = [
    { machineNumberCandidate: "563", machineNumberOcr: { accepted: true, candidate: "563" } },
    { machineNumberCandidate: "565", machineNumberOcr: { accepted: false, candidate: "565" } },
    { machineNumberCandidate: "586", machineNumberOcr: { accepted: false, candidate: "586" } },
  ];

  const corrected = validateReviewedNumberAssignment(slots, ["563", "564", "566"]);
  assert.strictEqual(corrected.valid, true);
  assert.deepStrictEqual(corrected.trustedCandidates, ["563", null, null]);
  assert.deepStrictEqual(corrected.mismatchIndices, []);
  assert.deepStrictEqual(corrected.mismatches, []);

  const overwritten = validateReviewedNumberAssignment(slots, ["562", "564", "566"]);
  assert.strictEqual(overwritten.valid, false);
  assert.deepStrictEqual(overwritten.mismatchIndices, [0]);
  assert.deepStrictEqual(overwritten.mismatches, [{ index: 0, expected: "563", actual: "562" }]);
  assert.ok(overwritten.errors.includes("ocr-candidate-mismatch"));
});

test("validateReviewedNumberAssignment: 手修正後も件数・不正値・重複の検証を維持する", () => {
  const slots = [
    { machineNumberOcr: { accepted: false, candidate: null } },
    { machineNumberOcr: { accepted: false, candidate: "586" } },
  ];
  const result = validateReviewedNumberAssignment(slots, ["566", "0566"]);
  assert.strictEqual(result.valid, false);
  assert.deepStrictEqual(result.duplicateNumbers, ["566"]);
  assert.ok(result.errors.includes("duplicate-number"));
});

test("validateReviewedNumberAssignment: 共同照合済みの固定点を手動設定で上書きさせない", () => {
  const slots = [
    { jointMatch: { accepted: true, resolvedNum: "479" }, machineNumberOcr: { accepted: false } },
    { jointMatch: { accepted: false }, machineNumberOcr: { accepted: false } },
    { jointMatch: { accepted: true, resolvedNum: "481" }, machineNumberOcr: { accepted: false } },
  ];

  assert.equal(validateReviewedNumberAssignment(slots, ["479", "480", "481"]).valid, true);
  const shifted = validateReviewedNumberAssignment(slots, ["478", "479", "480"]);
  assert.equal(shifted.valid, false);
  assert.deepEqual(shifted.mismatchIndices, [0, 2]);
});

test("validateReviewedNumberAssignment: 部分共同照合では未採用OCR候補を手動修正できる", () => {
  const slots = [
    { jointMatch: { accepted: true, resolvedNum: "479" }, machineNumberOcr: { accepted: true, candidate: "475" } },
    { machineNumberOcr: { accepted: true, candidate: "999" } },
  ];
  const reviewed = validateReviewedNumberAssignment(slots, ["479", "480"], { jointOnly: true });

  assert.equal(reviewed.valid, true);
  assert.deepStrictEqual(reviewed.mismatches, []);
  assert.deepStrictEqual(reviewed.normalizedNumbers, ["479", "480"]);
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

test("mergeTaiData: 写真OCRの空欄で既存機種名を消さず、確認履歴を残す", () => {
  const rows = [{ num: "818", val: 1000, island: "既存島", machineName: "既存機種" }];
  const tai = [{
    num: "818",
    island: "",
    machineName: " ",
    normalSpins: 1239,
    totalStarts: 12,
    sourceFile: "table.jpg",
    sourceLine: 3,
    sourceType: "local-image-ocr",
    ocrConfidence: 0.82,
    fieldConfidence: { num: 0.98, normalSpins: 0.91, totalStarts: 0.94, maxPayout: 0.89 },
    matchedBy: "machine-number+max-payout",
    maxPayout: 17370,
    reviewRequired: true,
    reviewConfirmed: true,
  }];
  const { rows: merged } = mergeTaiData(rows, tai);
  assert.strictEqual(merged[0].island, "既存島");
  assert.strictEqual(merged[0].machineName, "既存機種");
  assert.deepStrictEqual(merged[0].taiImportAudit, {
    sourceFile: "table.jpg",
    sourceLine: 3,
    sourceType: "local-image-ocr",
    ocrConfidence: 0.82,
    reviewRequired: true,
    reviewConfirmed: true,
    fieldConfidence: { num: 0.98, normalSpins: 0.91, totalStarts: 0.94, maxPayout: 0.89 },
    matchedBy: "machine-number+max-payout",
    graphMaxPayout: null,
    graphMaxPayoutAccepted: false,
    importedMaxPayout: 17370,
    importedMaxPayoutAccepted: true,
    selectedMaxPayoutSource: "import",
  });
  assert.strictEqual(merged[0].maxPayout, 17370);
});

test("mergeTaiData: 確定済みグラフ最高出玉を低信頼の表OCRで上書きしない", () => {
  const rows = [{
    num: "479",
    val: 1200,
    status: "ok",
    maxPayout: 17370,
    maxPayoutAccepted: true,
  }];
  const tai = [{
    num: "479",
    normalSpins: 1104,
    totalStarts: 14,
    maxPayout: 17330,
    maxPayoutAccepted: false,
    fieldAccepted: { maxPayout: false },
    sourceType: "local-image-ocr",
  }];

  const { rows: merged } = mergeTaiData(rows, tai);

  assert.strictEqual(merged[0].maxPayout, 17370);
  assert.strictEqual(merged[0].maxPayoutAccepted, true);
  assert.deepStrictEqual({
    graphMaxPayout: merged[0].taiImportAudit.graphMaxPayout,
    graphMaxPayoutAccepted: merged[0].taiImportAudit.graphMaxPayoutAccepted,
    importedMaxPayout: merged[0].taiImportAudit.importedMaxPayout,
    importedMaxPayoutAccepted: merged[0].taiImportAudit.importedMaxPayoutAccepted,
    selectedMaxPayoutSource: merged[0].taiImportAudit.selectedMaxPayoutSource,
  }, {
    graphMaxPayout: 17370,
    graphMaxPayoutAccepted: true,
    importedMaxPayout: 17330,
    importedMaxPayoutAccepted: false,
    selectedMaxPayoutSource: "graph",
  });
});

test("mergeTaiData: 不一致はマッチ0で元行を保つ", () => {
  const rows = [{ num: "1", val: 0 }];
  const tai = [{ num: "999", normalSpins: 100, totalStarts: 1 }];
  const { rows: merged, matched } = mergeTaiData(rows, tai);
  assert.strictEqual(matched, 0);
  assert.strictEqual(merged[0].val, 0);
});

test("mergeTaiData: AI差玉は未読取グラフの確定値に昇格させない", () => {
  const rows = [{ num: "818", val: null, rank: null, status: "failed", reasonCodes: ["missing-series"] }];
  const tai = [{ num: "818", val: 26000, normalSpins: 1000, totalStarts: 15 }];
  const { rows: merged, matched, unverifiedDeltaNumbers } = mergeTaiData(rows, tai);
  assert.strictEqual(matched, 1);
  assert.strictEqual(merged[0].val, null);
  assert.strictEqual(merged[0].rank, null);
  assert.strictEqual(merged[0].status, "failed");
  assert.strictEqual(merged[0].normalSpins, 1000);
  assert.deepStrictEqual(merged[0].reasonCodes, ["missing-series"]);
  assert.deepStrictEqual(unverifiedDeltaNumbers, ["818"]);
});

test("mergeTaiData: 重複行と明らかな異常差玉を確定値にしない", () => {
  const source = [
    { num: "818", val: null, rank: null, status: "failed" },
    { num: "819", val: null, rank: null, status: "failed" },
  ];
  const imported = [
    { num: "818", val: 1000 },
    { num: "0818", val: 2000 },
    { num: "819", val: 999999999999 },
  ];
  const result = mergeTaiData(source, imported);
  assert.deepStrictEqual(result.duplicateNumbers, ["818"]);
  assert.deepStrictEqual(result.invalidDeltaNumbers, ["819"]);
  assert.strictEqual(result.rows[0].val, null);
  assert.strictEqual(result.rows[0].status, "failed");
  assert.strictEqual(result.rows[1].val, null);
  assert.strictEqual(result.rows[1].status, "failed");
});

test("mergeTaiData: 確定済みグラフ差玉をAI取り込み値で上書きしない", () => {
  const source = [{ num: "810", val: -8500, rank: getRank(-8500).rank, status: "ok", confidence: 0.967 }];
  const result = mergeTaiData(source, [{ num: "810", val: 8500, normalSpins: 1200, totalStarts: 10 }]);
  assert.deepStrictEqual(result.conflictNumbers, ["810"]);
  assert.strictEqual(result.rows[0].val, -8500);
  assert.strictEqual(result.rows[0].rank, getRank(-8500).rank);
  assert.strictEqual(result.rows[0].confidence, 0.967);
  assert.strictEqual(result.rows[0].normalSpins, 1200);
});

test("validateDeltaRows: 未読取・要確認・重複番号があれば保存不可", () => {
  const valid = validateDeltaRows([
    { num: "810", val: 0, status: "ok" },
    { num: "811", val: -4500, status: "ok" },
  ]);
  assert.strictEqual(valid.valid, true);
  assert.strictEqual(valid.resolvedCount, 2);

  const invalid = validateDeltaRows([
    { num: "810", val: null, status: "failed" },
    { num: "810", val: 500, status: "review" },
  ]);
  assert.strictEqual(invalid.valid, false);
  assert.strictEqual(invalid.unresolvedCount, 2);
  assert.deepStrictEqual(invalid.pendingReviewIndices, [1]);
  assert.deepStrictEqual(invalid.missingIndices, [0]);
  assert.deepStrictEqual(invalid.duplicateNumbers, ["810"]);
  assert.deepStrictEqual(invalid.errors.sort(), ["duplicate-number", "unresolved-delta"]);
});

test("validateDeltaRows: 不正statusを未解決扱いにし、台番号を正規化して検証", () => {
  const invalid = validateDeltaRows([
    { num: "ABC", val: 500, status: "ok" },
    { num: "0810", val: 500, status: "ok" },
    { num: "810", val: 500, status: "bogus" },
  ]);
  assert.strictEqual(invalid.valid, false);
  assert.deepStrictEqual(invalid.invalidNumberIndices, [0]);
  assert.deepStrictEqual(invalid.duplicateNumbers, ["810"]);
  assert.deepStrictEqual(invalid.unresolvedIndices, [2]);
  assert.deepStrictEqual(invalid.invalidStatusIndices, [2]);
  assert.deepStrictEqual(invalid.errors.sort(), ["duplicate-number", "invalid-number", "unresolved-delta"]);
});

test("validateDeltaRows: 有限値を明示確認したreviewだけを確定扱いにする", () => {
  const result = validateDeltaRows([
    { num: "499", val: 28000, status: "review", reviewConfirmed: true },
    { num: "503", val: -2000, status: "review", reviewConfirmed: false },
    { num: "508", val: -3500, status: "review", reviewConfirmed: "true" },
    { num: "509", val: 1500, status: "ok" },
    { num: "510", val: null, status: "review", reviewConfirmed: true },
  ]);

  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.resolvedCount, 2);
  assert.deepStrictEqual(result.confirmedReviewIndices, [0]);
  assert.deepStrictEqual(result.pendingReviewIndices, [1, 2]);
  assert.deepStrictEqual(result.missingIndices, [4]);
  assert.deepStrictEqual(result.unresolvedIndices, [1, 2, 4]);
  assert.strictEqual(isResolvedDeltaRow({ val: 28000, status: "review", reviewConfirmed: true }), true);
  assert.strictEqual(isResolvedDeltaRow({ val: 28000, status: "review", reviewConfirmed: "true" }), false);
  assert.strictEqual(isResolvedDeltaRow({ val: null, status: "review", reviewConfirmed: true }), false);
});

test("validateDeltaRows: 上下端で切れた終点は画像から分かる境界値を満たすまで保存不可", () => {
  const lowerBound = {
    num: "574",
    val: 29500,
    status: "review",
    reviewConfirmed: true,
    valueConstraint: { kind: "lower-bound", boundary: "top", value: 30000 },
  };
  const upperBound = {
    num: "575",
    val: -29500,
    status: "review",
    reviewConfirmed: true,
    valueConstraint: { kind: "upper-bound", boundary: "bottom", value: -30000 },
  };

  assert.strictEqual(isDeltaValueWithinConstraint(lowerBound), false);
  assert.strictEqual(isDeltaValueWithinConstraint(lowerBound, 30000), true);
  assert.strictEqual(isDeltaValueWithinConstraint(upperBound), false);
  assert.strictEqual(isDeltaValueWithinConstraint(upperBound, -30000), true);
  assert.strictEqual(isResolvedDeltaRow(lowerBound), false);

  const invalid = validateDeltaRows([lowerBound, upperBound]);
  assert.strictEqual(invalid.valid, false);
  assert.deepStrictEqual(invalid.pendingReviewIndices, [0, 1]);
});

test("updateDeltaReview: 候補値・ランク・明示確認の監査情報を不変更新する", () => {
  const original = {
    num: "499",
    val: 28000,
    rank: getRank(28000).rank,
    status: "review",
    reviewConfirmed: false,
    reasonCodes: ["clipped-series"],
  };
  const reviewed = updateDeltaReview(original, {
    value: 29000,
    confirmed: true,
    reviewedAt: "2026-07-20T03:00:00.000Z",
  });

  assert.notStrictEqual(reviewed, original);
  assert.strictEqual(original.val, 28000);
  assert.strictEqual(reviewed.val, 29000);
  assert.strictEqual(reviewed.rank, getRank(29000).rank);
  assert.strictEqual(reviewed.status, "review");
  assert.strictEqual(reviewed.reviewConfirmed, true);
  assert.strictEqual(reviewed.reviewedAt, "2026-07-20T03:00:00.000Z");
  assert.strictEqual(reviewed.valueSource, "manual-review");
  assert.deepStrictEqual(reviewed.reasonCodes, ["clipped-series"]);
  assert.strictEqual(isResolvedDeltaRow(reviewed), true);

  const changedAgain = updateDeltaReview(reviewed, { value: 28500 });
  assert.strictEqual(changedAgain.reviewConfirmed, false);
  assert.strictEqual(changedAgain.reviewedAt, null);
  assert.strictEqual(changedAgain.valueSource, "manual-review-candidate");
  assert.strictEqual(isResolvedDeltaRow(changedAgain), false);
});

test("updateDeltaReview: 候補値が有限でなければ確認済みにせずfailedへ戻す", () => {
  const result = updateDeltaReview(
    { num: "503", val: -2000, status: "review" },
    { value: "読取不能", confirmed: true, reviewedAt: "2026-07-20T03:00:00.000Z" },
  );
  assert.strictEqual(result.val, null);
  assert.strictEqual(result.rank, null);
  assert.strictEqual(result.status, "failed");
  assert.strictEqual(result.reviewConfirmed, false);
  assert.strictEqual(result.reviewedAt, null);
});

test("updateDeltaReview: 境界制約に反する候補は確認済みにせず、境界以上なら確定する", () => {
  const row = {
    num: "574",
    val: 29500,
    status: "review",
    valueConstraint: { kind: "lower-bound", boundary: "top", value: 30000 },
  };
  const rejected = updateDeltaReview(row, {
    value: 29500,
    confirmed: true,
    reviewedAt: "2026-07-20T03:00:00.000Z",
  });
  assert.strictEqual(rejected.reviewConfirmed, false);
  assert.strictEqual(rejected.reviewedAt, null);
  assert.strictEqual(isResolvedDeltaRow(rejected), false);

  const confirmed = updateDeltaReview(row, {
    value: 30000,
    confirmed: true,
    reviewedAt: "2026-07-20T03:01:00.000Z",
  });
  assert.strictEqual(confirmed.reviewConfirmed, true);
  assert.strictEqual(confirmed.reviewedAt, "2026-07-20T03:01:00.000Z");
  assert.strictEqual(isResolvedDeltaRow(confirmed), true);
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

test("islandToNumbers: 複数行と欠けを考慮して実在番号だけ返す", () => {
  const ranges = islandToNumbers({
    ranges: [{ start: 509, end: 499 }, { start: 479, end: 490 }, { start: 546, end: 548 }],
  });
  assert.strictEqual(ranges.length, 26);
  assert.strictEqual(ranges[0], "479");
  assert.strictEqual(ranges[11], "490");
  assert.strictEqual(ranges[12], "499");
  assert.strictEqual(ranges.at(-1), "548");

  const withGap = islandToNumbers({ start: 499, end: 509, gaps: [505] });
  assert.strictEqual(withGap.length, 10);
  assert.ok(!withGap.includes("505"));
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

test("makeScan: OCRの全試行を保存せず、判定に必要な要約だけ残す", () => {
  const sourceRow = {
    num: "566",
    val: 18000,
    status: "ok",
    machineNumberOcr: {
      accepted: true,
      status: "ok",
      candidate: "566",
      confidence: 0.91,
      digits: [{ candidate: "5", bestDistance: 0.1 }],
      ensemble: {
        candidate: "566",
        votes: 2,
        attempts: [
          { darkThreshold: 110, candidate: "566" },
          { darkThreshold: 125, candidate: "566" },
        ],
      },
    },
  };

  const scan = makeScan({ id: "compact", date: "2026-07-20", rows: [sourceRow] });
  assert.notStrictEqual(scan.rows[0], sourceRow);
  assert.strictEqual("digits" in scan.rows[0].machineNumberOcr, false);
  assert.deepStrictEqual(scan.rows[0].machineNumberOcr.ensemble, {
    candidate: "566",
    votes: 2,
    attemptCount: 2,
  });
  assert.strictEqual("attempts" in scan.rows[0].machineNumberOcr.ensemble, false);
  assert.strictEqual(sourceRow.machineNumberOcr.ensemble.attempts.length, 2);
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
