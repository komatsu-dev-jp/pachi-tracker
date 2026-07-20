import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSiteSevenImageOcrPrompt,
  classifySiteSevenFile,
  decodeSiteSevenCsvBytes,
  parseDelimitedRows,
  parseSiteSevenCsvText,
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

test("buildSiteSevenImageOcrPrompt: 列の取り違えと台番号の推測を禁止する", () => {
  const prompt = buildSiteSevenImageOcrPrompt({
    dateText: "2026/07/20",
    storeName: "スーパーキスケPAO",
    expectedNumbers: [479, 480],
  });
  assert.match(prompt, /通常中スタート/);
  assert.match(prompt, /「大当り回数」の列/);
  assert.match(prompt, /初当り回数.*取り違えない/);
  assert.match(prompt, /479, 480/);
  assert.match(prompt, /画像にない行を作らない/);
});
