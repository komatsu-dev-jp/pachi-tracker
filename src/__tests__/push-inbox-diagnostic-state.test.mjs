import assert from "node:assert/strict";
import test from "node:test";

import {
  getRecheckStatus,
  PUSH_RECHECK_TIMEOUT_MS,
  toRecentImportSummary,
  waitForInboxStatus,
} from "../components/pushInboxDiagnosticState.js";

test("直近の自動確認結果は6項目だけを安全な非負整数へ正規化する", () => {
  assert.deepEqual(toRecentImportSummary({
    imported: 1,
    duplicate: 2,
    resolved: 3,
    waiting: 4,
    rejected: 5,
    errors: 6,
    unexpected: 7,
  }), {
    imported: 1,
    duplicate: 2,
    resolved: 3,
    waiting: 4,
    rejected: 5,
    errors: 6,
  });
});

test("直近の自動確認結果は無効な入力を安全に扱う", () => {
  assert.equal(toRecentImportSummary(null), null);
  assert.equal(toRecentImportSummary("summary"), null);
  assert.deepEqual(toRecentImportSummary({
    imported: -1,
    duplicate: 1.5,
    resolved: Number.MAX_SAFE_INTEGER + 1,
    waiting: "4",
    rejected: NaN,
    errors: null,
  }), {
    imported: 0,
    duplicate: 0,
    resolved: 0,
    waiting: 0,
    rejected: 0,
    errors: 0,
  });
});

test("再確認完了文は安全に読める保留数に応じて変わる", () => {
  assert.equal(
    getRecheckStatus({ summary: { pending: 1, review: 0 } }),
    "自動確認の結果を更新しました。残る場合は診断情報を確認してください。",
  );
  assert.equal(
    getRecheckStatus({ summary: { pending: 0, review: 0 } }),
    "自動確認の結果を更新しました。",
  );
  assert.equal(
    getRecheckStatus({ summary: { pending: "1", review: -1 } }),
    "自動確認の結果を更新しました。",
  );
});

test("診断の再読込に失敗した場合は明示的な失敗案内を返す", () => {
  assert.equal(PUSH_RECHECK_TIMEOUT_MS, 30_000);
  assert.equal(
    getRecheckStatus({ summary: { pending: 1, review: 1 }, refreshFailed: true }),
    "自動確認は完了しましたが、診断を更新できません。診断を更新してください。",
  );
});

test("受信箱状態の待機はPromiseのresolve結果だけを返す", async () => {
  const value = ["summary", "diagnostics"];
  assert.deepEqual(
    await waitForInboxStatus(Promise.resolve(value), 0),
    { status: "resolved", value },
  );
});

test("受信箱状態の待機はPromiseのrejectを例外原文なしで終端する", async () => {
  assert.deepEqual(
    await waitForInboxStatus(Promise.reject(new Error("private error")), 10),
    { status: "rejected" },
  );
});

test("受信箱状態の待機は未解決Promiseを期限切れで終端する", async () => {
  const never = new Promise(() => {});
  assert.deepEqual(
    await waitForInboxStatus(never, 0),
    { status: "timed-out" },
  );
});
