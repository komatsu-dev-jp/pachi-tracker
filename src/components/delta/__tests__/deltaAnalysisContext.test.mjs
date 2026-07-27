import assert from "node:assert/strict";
import {
  buildDeltaAnalysisConfirmation,
  deltaEventLabel,
  deltaIslandScopeLabel,
} from "../deltaAnalysisContext.js";

assert.equal(deltaEventLabel(""), "通常日");
assert.equal(deltaEventLabel("old-event"), "旧イベント日");
assert.equal(deltaEventLabel("special-day"), "特定日");
assert.equal(deltaEventLabel("store-event"), "店舗イベント");
assert.equal(deltaEventLabel("unknown"), "未設定");

const islands = [
  { id: "a", name: "A島" },
  { id: "b", name: "B島" },
];
assert.equal(deltaIslandScopeLabel(islands, "all"), "店舗全体（台番号から自動判定）");
assert.equal(deltaIslandScopeLabel(islands, "b"), "B島");
assert.equal(deltaIslandScopeLabel(islands, "missing"), "店舗全体（台番号から自動判定）");

const confirmation = buildDeltaAnalysisConfirmation({
  storeName: "テスト店",
  analysisDate: "2026-07-27",
  eventType: "special-day",
  islands,
  islandScopeId: "b",
  fileCount: 3,
});
assert.equal(confirmation.title, "解析内容を確認してください");
assert.equal(confirmation.confirmLabel, "この内容で解析");
assert.equal(confirmation.cancelLabel, "入力内容を見直す");
assert.match(confirmation.message, /店舗：テスト店/);
assert.match(confirmation.message, /日付：2026-07-27/);
assert.match(confirmation.message, /イベント：特定日/);
assert.match(confirmation.message, /解析範囲：B島/);
assert.match(confirmation.message, /追加資料：3件/);

console.log("deltaAnalysisContext.test.mjs: all tests passed");
