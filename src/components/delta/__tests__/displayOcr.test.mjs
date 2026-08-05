import assert from "node:assert/strict";
import test from "node:test";
import { confirmDisplayField, makeOcrField, mergeDisplayScanRows, normalizeDisplayRow, parseDisplayNumber, parseDisplayOcrText, setDisplayFieldValue, validateDisplayRows } from "../displayOcr.js";

const hash = "a".repeat(64);
const otherHash = "b".repeat(64);
const target = { id: "scan", date: "2026-08-05", storeName: "店舗A", machineName: "機種A", rows: [] };
function row(num = 1) {
  const result = {
    machineNumber: makeOcrField(String(num), num), rotations: makeOcrField("0", 0), jackpots: makeOcrField("0", 0), payout: makeOcrField("-1500", -1500),
    businessDate: makeOcrField("2026-08-05", "2026-08-05"), storeName: makeOcrField("店舗A", "店舗A"), machineName: makeOcrField("機種A", "機種A"),
  };
  for (const key of Object.keys(result)) result[key].status = "confirmed";
  return result;
}
test("numeric parser keeps explicit zero and negative values", () => { assert.equal(parseDisplayNumber("0"), 0); assert.equal(parseDisplayNumber("-1,500"), -1500); });
test("NaN, Infinity and missing values become null", () => { assert.equal(parseDisplayNumber("NaN"), null); assert.equal(makeOcrField("", Infinity).value, null); assert.equal(normalizeDisplayRow({}).saveable, false); });
test("editing makes a field manual and unconfirmed", () => { const edited = setDisplayFieldValue(row(), "payout", "0"); assert.equal(edited.payout.value, 0); assert.equal(edited.payout.status, "unconfirmed"); assert.equal(edited.payout.source, "manual"); });
test("all seven fields require explicit confirmation", () => { let value = row(); value.payout.status = "unconfirmed"; assert.equal(normalizeDisplayRow(value).saveable, false); value = confirmDisplayField(value, "payout"); assert.equal(normalizeDisplayRow(value).saveable, true); });
test("low confidence alone does not auto-confirm", () => { const value = row(); value.payout = makeOcrField("0", 0, 1, "ocr", "unconfirmed"); assert.equal(normalizeDisplayRow(value).saveable, false); });
test("multiple labelled dates conflict", () => { assert.equal(parseDisplayOcrText("営業日: 2026-08-05\n集計日: 2026-08-04").businessDate.status, "conflict"); });
test("all request duplicates conflict", () => { assert.equal(validateDisplayRows([row(1), row(1)], { target }).every((item) => item.status === "conflict"), true); });
test("target duplicate and target metadata mismatches conflict", () => { assert.equal(validateDisplayRows([row(1)], { target: { ...target, rows: [{ num: "1" }] } })[0].status, "conflict"); const value = row(); value.storeName.value = "店舗B"; assert.equal(validateDisplayRows([value], { target })[0].status, "conflict"); });
test("normal rows append while conflicting rows remain conflicts", () => { const result = mergeDisplayScanRows([target], { targetScanId: "scan", sourceFingerprint: { hash }, rows: [row(1), row(1)] }); assert.equal(result.status, "conflict"); assert.equal(result.scans[0].rows.length, 0); const mixed = mergeDisplayScanRows([target], { targetScanId: "scan", sourceFingerprint: { hash }, rows: [row(1), { ...row(2), storeName: makeOcrField("店舗B", "店舗B", 0, "ocr", "confirmed") }] }); assert.equal(mixed.scans[0].rows.length, 1); });
test("same retry is noop and changed retry conflicts", () => { const first = mergeDisplayScanRows([target], { targetScanId: "scan", sourceFingerprint: { hash }, rows: [row(1)] }); assert.equal(first.status, "appended"); assert.equal(mergeDisplayScanRows(first.scans, { targetScanId: "scan", sourceFingerprint: { hash }, rows: [row(1)] }).status, "noop"); const changed = row(1); changed.payout.value = 1; assert.equal(mergeDisplayScanRows(first.scans, { targetScanId: "scan", sourceFingerprint: { hash }, rows: [changed] }).status, "conflict"); });
test("different fingerprint cannot append a duplicate machine number", () => {
  const first = mergeDisplayScanRows([target], { targetScanId: "scan", sourceFingerprint: { hash }, rows: [row(1)] });
  const second = mergeDisplayScanRows(first.scans, { targetScanId: "scan", sourceFingerprint: { hash: otherHash }, rows: [row(1)] });
  assert.equal(second.status, "conflict"); assert.deepEqual(second.scans, first.scans); assert.deepEqual(second.rowResults[0].conflicts, ["machine-number"]);
});
test("legacy history is supported and compatible rows have legacy fields", () => { const result = mergeDisplayScanRows([{ ...target, appendHistory: undefined }], { targetScanId: "scan", sourceFingerprint: { hash }, rows: [row(1)] }); const saved = result.scans[0].rows[0]; assert.deepEqual(Object.keys(saved).filter((key) => ["num", "val", "normalSpins", "totalStarts", "machineName", "displayOcr", "source", "status", "reviewConfirmed"].includes(key)).length, 9); assert.equal(result.scans[0].appendHistory.length, 1); });
