import test from "node:test";
import assert from "node:assert/strict";
import {
  GUARDED_SESSION_CONTEXT,
  isQuickStartEditableContext,
  mergeSessionContextRequest,
  shouldBlockSessionContextChange,
} from "../sessionContextGuard.js";

test("通常セッションは開始後の店舗・機種・レート変更を止める", () => {
  assert.equal(shouldBlockSessionContextChange(false, { labels: ["店舗"] }), false);
  assert.equal(shouldBlockSessionContextChange(true, { labels: ["店舗"] }), true);
  for (const label of ["店舗", "機種", "貸玉", "交換率"]) {
    assert.ok(GUARDED_SESSION_CONTEXT.includes(label));
  }
});

test("quick sessions allow only metadata after activity", () => {
  assert.equal(isQuickStartEditableContext(["店舗", "機種", "台番号"]), true);
  assert.equal(isQuickStartEditableContext(["店舗", "貸玉"]), false);
  assert.equal(shouldBlockSessionContextChange(true, { quickStartSession: true, labels: ["店舗", "機種"] }), false);
  assert.equal(shouldBlockSessionContextChange(true, { quickStartSession: true, labels: ["機種スペック"] }), true);
  assert.equal(shouldBlockSessionContextChange(true, { quickStartSession: true, labels: ["交換率"] }), true);
  assert.equal(shouldBlockSessionContextChange(true, { labels: ["店舗"] }), true);
});

test("連続した変更要求を重複なく1つの案内へまとめる", () => {
  const first = mergeSessionContextRequest(null, ["店舗", "貸玉"]);
  const second = mergeSessionContextRequest(first, ["貸玉", "交換率"]);
  assert.deepEqual(second.labels, ["店舗", "貸玉", "交換率"]);
});
