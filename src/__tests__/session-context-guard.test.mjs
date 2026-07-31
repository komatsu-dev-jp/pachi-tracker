import test from "node:test";
import assert from "node:assert/strict";
import {
  GUARDED_SESSION_CONTEXT,
  mergeSessionContextRequest,
  shouldBlockSessionContextChange,
} from "../sessionContextGuard.js";

test("実戦中だけ店舗・機種・レート変更を止める", () => {
  assert.equal(shouldBlockSessionContextChange(false), false);
  assert.equal(shouldBlockSessionContextChange(true), true);
  for (const label of ["店舗", "機種", "貸玉", "交換率"]) {
    assert.ok(GUARDED_SESSION_CONTEXT.includes(label));
  }
});

test("連続したsetter呼び出しを1つの案内へ重複なくまとめる", () => {
  const first = mergeSessionContextRequest(null, ["店舗", "貸玉"]);
  const second = mergeSessionContextRequest(first, ["貸玉", "交換率"]);
  assert.deepEqual(second.labels, ["店舗", "貸玉", "交換率"]);
});
