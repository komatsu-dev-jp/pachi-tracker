import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifySiteSevenFile,
  decodeSiteSevenCsvBytes,
  mergeSiteSevenParsedResults,
  parseDelimitedRows,
  parseSiteSevenCsvText,
  prepareSiteSevenImportedRows,
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
      result: { rows: [{ num: "479", normalSpins: "1109", totalStarts: "14", reviewRequired: false }] },
    },
    {
      kind: "pdf",
      result: { rows: [{ num: "479", normalSpins: 1104, totalStarts: 14 }] },
    },
  ], { expectedNumbers: [479] });

  assert.equal(merged.rows.length, 1);
  assert.equal(merged.rows[0].normalSpins, 1104);
  assert.equal(merged.rows[0].reviewRequired, true);
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
