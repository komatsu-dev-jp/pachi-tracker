import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applySiteSevenFieldEdit,
  classifySiteSevenFile,
  decodeSiteSevenCsvBytes,
  mergeSiteSevenParsedResults,
  parseDelimitedRows,
  parseSiteSevenCsvText,
  prepareSiteSevenImportedRows,
  removeSiteSevenImportedRow,
  readSiteSevenCsv,
} from "../siteSevenDataInput.js";

test("parseDelimitedRows: 引用符内のカンマ・改行・二重引用符を保持する", () => {
  const rows = parseDelimitedRows('機種名,台番\r\n"P機種,改",479\r\n"P""引用""",480');
  assert.deepEqual(rows, [
    ["機種名", "台番"],
    ["P機種,改", "479"],
    ['P"引用"', "480"],
  ]);
});

test("parseSiteSevenCsvText: サイトセブン6列CSVを台番号ごとに読む", () => {
  const csv = [
    "台番,累計スタート,通常中スタート,初当り回数,最高出玉,大当り回数",
    "479,1912,1104,3,17370,14",
    "480,1859,1319,3,13330,12",
    "574,3932,1816,7,57350,49",
    "平均,2175,1280,4,14743,16",
  ].join("\n");
  const result = parseSiteSevenCsvText(csv, {
    dateText: "2026/07/20",
    storeName: "スーパーキスケPAO",
    fileName: "site-seven.csv",
  });

  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.rows.map(({ num, normalSpins, totalStarts }) => ({ num, normalSpins, totalStarts })), [
    { num: "479", normalSpins: 1104, totalStarts: 14 },
    { num: "480", normalSpins: 1319, totalStarts: 12 },
    { num: "574", normalSpins: 1816, totalStarts: 49 },
  ]);
  assert.equal(result.rows[0].sourceFile, "site-seven.csv");
  assert.equal(result.skipped.length, 0);
});

test("parseSiteSevenCsvText: 先頭の選択列・TSV・機種名列に対応する", () => {
  const tsv = [
    "選択\t機種名\t台番号\t通常回転数\t総当たり回数",
    "\tP北斗の拳\t0810\t1,239\t12",
  ].join("\n");
  const { rows, delimiter } = parseSiteSevenCsvText(tsv);
  assert.equal(delimiter, "\t");
  assert.deepEqual(rows[0], {
    date: "",
    store: "",
    island: "P北斗の拳島",
    machineName: "P北斗の拳",
    num: "810",
    normalSpins: 1239,
    totalStarts: 12,
    sourceFile: "",
    sourceLine: 2,
  });
});

test("parseSiteSevenCsvText: 不正行を理由付きで除外し、重複は後の行を採用する", () => {
  const csv = [
    "台番,通常中スタート,大当り回数",
    "479,1104,14",
    "480,不明,12",
    "479,999,8",
  ].join("\n");
  const result = parseSiteSevenCsvText(csv);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].normalSpins, 999);
  assert.deepEqual(result.duplicates, [{ num: "479", lineNumber: 4 }]);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /数値/);
});

test("parseSiteSevenCsvText: 必須見出しがないCSVを位置推測で読まない", () => {
  assert.throws(
    () => parseSiteSevenCsvText("479,1912,1104,3,17370,14"),
    /見出し/,
  );
});

test("decode/readSiteSevenCsv: UTF-8 BOM付きファイルを端末内で読む", async () => {
  const bytes = new TextEncoder().encode("\uFEFF台番,通常中スタート,大当り回数\n479,1104,14");
  const decoded = decodeSiteSevenCsvBytes(bytes);
  assert.equal(decoded.encoding, "UTF-8");

  const parsed = await readSiteSevenCsv({
    name: "table.csv",
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  });
  assert.equal(parsed.rows[0].num, "479");
});

test("decodeSiteSevenCsvBytes: SiteSevenで使われるShift_JISも読む", () => {
  const hex = "91e494d42c92ca8fed92868358835e815b83672c91e5939682e889f190940a3437392c313130342c3134";
  const bytes = Uint8Array.from(Buffer.from(hex, "hex"));
  const decoded = decodeSiteSevenCsvBytes(bytes);
  assert.equal(decoded.encoding, "Shift_JIS");
  const parsed = parseSiteSevenCsvText(decoded.text);
  assert.deepEqual(parsed.rows.map(({ num, normalSpins, totalStarts }) => ({ num, normalSpins, totalStarts })), [
    { num: "479", normalSpins: 1104, totalStarts: 14 },
  ]);
});

test("classifySiteSevenFile: PDF・写真・CSVだけを分類する", () => {
  assert.equal(classifySiteSevenFile({ name: "data.pdf", type: "" }), "pdf");
  assert.equal(classifySiteSevenFile({ name: "screen.JPG", type: "image/jpeg" }), "image");
  assert.equal(classifySiteSevenFile({ name: "data.tsv", type: "text/tab-separated-values" }), "csv");
  assert.equal(classifySiteSevenFile({ name: "memo.txt", type: "text/plain" }), null);
});

test("mergeSiteSevenParsedResults: 写真はPDFの確定値を上書きせず、不一致だけ要確認にする", () => {
  const merged = mergeSiteSevenParsedResults([
    {
      kind: "image",
      result: { rows: [{
        num: "479", normalSpins: "1109", totalStarts: "14", reviewRequired: false,
        numAccepted: true, maxPayoutAccepted: true,
      }] },
    },
    {
      kind: "pdf",
      result: { rows: [{
        num: "479", normalSpins: 1104, totalStarts: 14,
        numAccepted: true, maxPayoutAccepted: true,
      }] },
    },
  ], { expectedNumbers: [479] });

  assert.equal(merged.rows.length, 1);
  assert.equal(merged.rows[0].normalSpins, 1104);
  assert.equal(merged.rows[0].reviewRequired, true);
  assert.equal(merged.rows[0].jointEvidenceRejected, true);
  assert.match(merged.rows[0].reviewReason, /一致しません/);
});

test("mergeSiteSevenParsedResults: 同じ値なら低信頼写真を無視してPDFを採用する", () => {
  const merged = mergeSiteSevenParsedResults([
    {
      kind: "image",
      result: { rows: [{ num: "479", normalSpins: "1104", totalStarts: "14", reviewRequired: true }] },
    },
    {
      kind: "pdf",
      result: { rows: [{ num: "479", normalSpins: 1104, totalStarts: 14 }] },
    },
  ], { expectedNumbers: [479] });

  assert.equal(merged.rows.length, 1);
  assert.equal(Boolean(merged.rows[0].reviewRequired), false);
  assert.equal(merged.rows[0].importKind, "pdf");
  assert.equal(merged.rows[0].structuredRowTrusted, true);
  assert.equal(merged.rows[0].fieldAccepted.num, true);
  assert.equal(merged.rows[0].fieldAccepted.normalSpins, true);
  assert.equal(merged.rows[0].fieldAccepted.totalStarts, true);
});

test("mergeSiteSevenParsedResults: PDF・CSVで明示的に拒否した項目を再読込で採用済みに戻さない", () => {
  for (const kind of ["pdf", "csv"]) {
    const merged = mergeSiteSevenParsedResults([{
      kind,
      result: { rows: [{
        num: "548",
        normalSpins: 631,
        totalStarts: 40,
        maxPayout: 49190,
        structuredRowTrusted: true,
        fieldAccepted: {
          num: true,
          normalSpins: false,
          totalStarts: true,
          maxPayout: true,
        },
      }] },
    }], { expectedNumbers: [548] });

    assert.equal(merged.rows.length, 1);
    assert.equal(merged.rows[0].structuredRowTrusted, false, `${kind}の行信頼を復活させない`);
    assert.equal(merged.rows[0].fieldAccepted.normalSpins, false, `${kind}の項目拒否を維持する`);
  }
});

test("applySiteSevenFieldEdit: 構造化PDF・CSVも手修正した項目を再確認まで信頼しない", () => {
  const trusted = {
    num: "548",
    normalSpins: 631,
    totalStarts: 40,
    maxPayout: 49190,
    structuredRowTrusted: true,
    jointMatchAccepted: true,
    fieldAccepted: { num: true, normalSpins: true, totalStarts: true, maxPayout: true },
  };
  const editedSpins = applySiteSevenFieldEdit(trusted, "normalSpins", "632");
  assert.equal(editedSpins.structuredRowTrusted, false);
  assert.equal(editedSpins.fieldAccepted.normalSpins, false);
  assert.equal(editedSpins.reviewRequired, true);
  assert.equal(editedSpins.reviewConfirmed, false);
  assert.equal(editedSpins.jointMatchAccepted, true, "回転数だけの修正では台対応自体は維持する");

  const editedMax = applySiteSevenFieldEdit(trusted, "maxPayout", "49180");
  assert.equal(editedMax.fieldAccepted.maxPayout, false);
  assert.equal(editedMax.jointMatchAccepted, false, "照合キーを変えたら共同照合を無効化する");
  assert.equal(editedMax.jointEvidenceRejected, true);
});

test("mergeSiteSevenParsedResults: 最高出玉が双方にあり不一致なら確認対象にする", () => {
  const merged = mergeSiteSevenParsedResults([
    {
      kind: "image",
      result: { rows: [{ num: "479", normalSpins: 1104, totalStarts: 14, maxPayout: 17330 }] },
    },
    {
      kind: "pdf",
      result: { rows: [{ num: "479", normalSpins: 1104, totalStarts: 14, maxPayout: 17370 }] },
    },
  ], { expectedNumbers: [479] });

  assert.equal(merged.rows.length, 1);
  assert.equal(merged.rows[0].maxPayout, 17370);
  assert.equal(merged.rows[0].reviewRequired, true);
  assert.match(merged.rows[0].reviewReason, /一致しません/);
});

test("mergeSiteSevenParsedResults: CSV・PDF内の重複台は確認前に統合しない", () => {
  for (const kind of ["csv", "pdf"]) {
    const merged = mergeSiteSevenParsedResults([{
      kind,
      result: {
        rows: [{ num: "479", normalSpins: 1104, totalStarts: 14 }],
        duplicates: [{ num: "479", lineNumber: 4 }],
      },
    }], { expectedNumbers: [479] });

    assert.equal(merged.rows[0].reviewRequired, true);
    assert.equal(merged.rows[0].reviewConfirmed, false);
    assert.match(merged.rows[0].reviewReason, /元資料内.*重複/);
    assert.equal(merged.duplicateCount, 1);
    assert.deepEqual(merged.duplicateNumbers, ["479"]);
    const prepared = prepareSiteSevenImportedRows(merged.rows, { expectedNumbers: [479] });
    assert.equal(prepared.rows.length, 0);
    assert.equal(prepared.reviewPendingCount, 1);
  }
});

test("mergeSiteSevenParsedResults: 分割写真20/20/12相当を全体で照合する", () => {
  const expectedNumbers = [479, 480, 481, 482, 483];
  const makeRows = (numbers) => numbers.map((num) => ({
    num: String(num), normalSpins: "100", totalStarts: "1", reviewRequired: false,
  }));
  const merged = mergeSiteSevenParsedResults([
    { kind: "image", result: { rows: makeRows([479, 480]) } },
    { kind: "image", result: { rows: makeRows([481, 482]) } },
    { kind: "image", result: { rows: makeRows([483]) } },
  ], { expectedNumbers });

  assert.equal(merged.rows.length, 5);
  assert.equal(merged.recognizedCount, 5);
  assert.equal(merged.reviewCount, 0);
  assert.deepEqual(merged.missingNumbers, []);
});

test("mergeSiteSevenParsedResults: 行が不足した場合は入力可能な要確認行を補う", () => {
  const merged = mergeSiteSevenParsedResults([
    {
      kind: "image",
      result: { rows: [{ num: "479", normalSpins: "1104", totalStarts: "14" }] },
    },
  ], { expectedNumbers: [479, 480] });

  assert.equal(merged.rows.length, 2);
  assert.equal(merged.recognizedCount, 1);
  assert.equal(merged.rows[1].num, "480");
  assert.equal(merged.rows[1].reviewRequired, true);
  assert.equal(merged.rows[1].normalSpins, "");
});

test("mergeSiteSevenParsedResults: 一意な未確認候補行と欠落欄を二重生成しない", () => {
  const merged = mergeSiteSevenParsedResults([{
    kind: "image",
    result: { rows: [{
      num: "",
      machineNumberSuggested: "479",
      normalSpins: "1104",
      totalStarts: "14",
      reviewRequired: true,
    }] },
  }], { expectedNumbers: [479] });

  assert.equal(merged.rows.length, 1);
  assert.deepEqual(merged.missingNumbers, []);
  assert.equal(merged.rows[0].num, "");
  assert.equal(merged.rows[0].machineNumberSuggested, "479");
});

test("mergeSiteSevenParsedResults: 候補が重複する時は欠落台の入力欄を残す", () => {
  const ambiguousRows = [1, 2].map((sourceLine) => ({
    num: "",
    machineNumberSuggested: "479",
    normalSpins: "1104",
    totalStarts: "14",
    sourceLine,
    reviewRequired: true,
  }));
  const merged = mergeSiteSevenParsedResults([{
    kind: "image",
    result: { rows: ambiguousRows },
  }], { expectedNumbers: [479] });

  assert.deepEqual(merged.missingNumbers, ["479"]);
  assert.equal(merged.rows.length, 3);
  assert.ok(merged.rows.some((row) => (
    row.sourceType === "missing-placeholder" && row.num === "479"
  )));
});

test("mergeSiteSevenParsedResults: 誤読した余分な行で件数が同じでも不足台の修正欄を残す", () => {
  const merged = mergeSiteSevenParsedResults([{
    kind: "image",
    result: {
      rows: [
        { num: "475", normalSpins: "1104", totalStarts: "14", reviewRequired: true },
        { num: "480", normalSpins: "1319", totalStarts: "12" },
      ],
    },
  }], { expectedNumbers: [479, 480] });

  assert.equal(merged.recognizedCount, 2);
  assert.deepEqual(merged.missingNumbers, ["479"]);
  assert.equal(merged.rows.length, 3);
  const placeholder = merged.rows.find((row) => row.sourceType === "missing-placeholder");
  assert.equal(placeholder?.num, "479");
  assert.equal(placeholder?.reviewRequired, true);
});

test("prepareSiteSevenImportedRows: 要確認行は確認前に統合せず、確認後だけ採用する", () => {
  const pending = { num: "479", normalSpins: "1104", totalStarts: "14", reviewRequired: true };
  const before = prepareSiteSevenImportedRows([pending]);
  assert.equal(before.rows.length, 0);
  assert.equal(before.reviewPendingCount, 1);

  const after = prepareSiteSevenImportedRows([{ ...pending, reviewConfirmed: true }]);
  assert.equal(after.rows.length, 1);
  assert.equal(after.rows[0].normalSpins, 1104);
  assert.equal(after.rows[0].totalStarts, 14);
});

test("prepareSiteSevenImportedRows: 51台が保留でも安全な1台は先に部分統合できる", () => {
  const safe = { num: "479", normalSpins: 1104, totalStarts: 14, reviewRequired: false };
  const pending = Array.from({ length: 51 }, (_, index) => ({
    num: String(480 + index),
    normalSpins: 100 + index,
    totalStarts: index,
    reviewRequired: true,
    reviewConfirmed: false,
  }));
  const result = prepareSiteSevenImportedRows([safe, ...pending]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].num, "479");
  assert.equal(result.reviewPendingCount, 51);
});

test("prepareSiteSevenImportedRows: 確認済みでも重複台番号や差玉側にない台を統合しない", () => {
  const result = prepareSiteSevenImportedRows([
    { num: "479", normalSpins: "1104", totalStarts: "14", reviewRequired: true, reviewConfirmed: true },
    { num: "479", normalSpins: "999", totalStarts: "9", reviewRequired: true, reviewConfirmed: true },
    { num: "999", normalSpins: "100", totalStarts: "1", reviewRequired: true, reviewConfirmed: true },
  ], { expectedNumbers: [479, 480] });

  assert.equal(result.rows.length, 0);
  assert.deepEqual(result.duplicateNumbers, ["479"]);
  assert.deepEqual(result.unexpectedNumbers, ["999"]);
});

test("removeSiteSevenImportedRow: 平均の誤認行を除外して台数・要確認件数を更新する", () => {
  const rows = [
    { num: "574", normalSpins: 1816, totalStarts: 49, sourceType: "local-image-ocr" },
    {
      num: "575",
      normalSpins: 1200,
      totalStarts: 16,
      sourceType: "local-image-ocr",
      reviewRequired: true,
      reviewConfirmed: false,
    },
  ];
  const result = removeSiteSevenImportedRow(rows, 1, {
    rowCount: 2,
    skippedCount: 1,
    reviewCount: 1,
    duplicateCount: 0,
    missingCount: 0,
  }, { expectedNumbers: [574] });

  assert.deepEqual(result.rows.map((row) => row.num), ["574"]);
  assert.equal(result.removedRow.num, "575");
  assert.deepEqual(result.summary, {
    rowCount: 1,
    skippedCount: 0,
    reviewCount: 0,
    duplicateCount: 0,
    missingCount: 0,
  });
});

test("removeSiteSevenImportedRow: 実在台を消した場合は不足を表示し、入力placeholderは削除しない", () => {
  const realRows = [
    { num: "574", normalSpins: 1816, totalStarts: 49, sourceType: "local-image-ocr" },
  ];
  const removed = removeSiteSevenImportedRow(realRows, 0, {
    rowCount: 1,
    skippedCount: 0,
    duplicateCount: 0,
    missingCount: 0,
  }, { expectedNumbers: [574] });
  assert.equal(removed.rows.length, 0);
  assert.equal(removed.summary.missingCount, 1);

  const placeholder = [{
    num: "574",
    sourceType: "missing-placeholder",
    reviewRequired: true,
  }];
  const blocked = removeSiteSevenImportedRow(placeholder, 0, { rowCount: 0 });
  assert.strictEqual(blocked.rows, placeholder);
  assert.equal(blocked.removedRow, null);
  assert.equal(blocked.blockedReason, "missing-placeholder");
});
