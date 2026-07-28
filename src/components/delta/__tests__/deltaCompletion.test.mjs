import assert from "node:assert/strict";
import test from "node:test";
import {
  createDeltaCompletionHistoryGuard,
  getDeltaSaveControlState,
  getDeltaSaveReadiness,
  makeDeltaCompletionSummary,
} from "../deltaCompletion.js";

function fakeWindow() {
  const listeners = new Map();
  const historyStack = [{ state: { base: true } }];
  const win = {
    location: { href: "https://example.test/app" },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    setTimeout,
    clearTimeout,
  };
  win.history = {
    state: historyStack[0].state,
    pushState(state) {
      historyStack.push({ state });
      this.state = state;
    },
    back() {
      historyStack.pop();
      this.state = historyStack.at(-1)?.state ?? null;
      listeners.get("popstate")?.({ type: "popstate" });
    },
  };
  return win;
}

test("保存完了中の端末戻るは差玉解析トップの処理を1回だけ呼ぶ", () => {
  const win = fakeWindow();
  let backCount = 0;
  const guard = createDeltaCompletionHistoryGuard({
    windowObject: win,
    onBack: () => { backCount += 1; },
  });

  win.history.back();
  assert.equal(backCount, 1);
  guard.dispose();
});

test("3択ボタンの処理は履歴マーカーを戻してから実行し、既定戻ると重複しない", () => {
  const win = fakeWindow();
  let defaultBackCount = 0;
  let actionCount = 0;
  const guard = createDeltaCompletionHistoryGuard({
    windowObject: win,
    onBack: () => { defaultBackCount += 1; },
  });

  guard.run(() => { actionCount += 1; });
  assert.equal(actionCount, 1);
  assert.equal(defaultBackCount, 0);
  guard.dispose();
});

test("完了サマリーは保存件数と除外件数を安全な数値へ揃える", () => {
  assert.deepEqual(
    makeDeltaCompletionSummary({
      scan: { id: "scan-1", storeName: "検証店", date: "2026-07-27" },
      validation: { savableCount: 12, excludedCount: 3 },
    }),
    {
      scanId: "scan-1",
      storeName: "検証店",
      date: "2026-07-27",
      savedCount: 12,
      excludedCount: 3,
    },
  );
});

test("回転率を計算できない70台でも差玉のみ保存を許可し、台データ追加を案内する", () => {
  assert.deepEqual(
    getDeltaSaveReadiness({
      canSaveRows: true,
      machineAssignmentsValid: true,
      savableCount: 70,
      predictedCount: 0,
    }),
    {
      canSaveDeltaOnly: true,
      allSavableRowsHavePrediction: false,
      needsPredictionData: true,
      canSaveWithRotation: false,
    },
  );
});

test("回転率不足を保存ボタンの無効化理由にしない", () => {
  const readiness = getDeltaSaveReadiness({
    canSaveRows: true,
    machineAssignmentsValid: true,
    savableCount: 3,
    predictedCount: 2,
  });
  const control = getDeltaSaveControlState({
    canSaveRows: true,
    canSaveDeltaOnly: readiness.canSaveDeltaOnly,
    savableCount: 3,
  });

  assert.equal(readiness.needsPredictionData, true);
  assert.deepEqual(control, {
    disabled: false,
    label: "3台を保存",
  });
});

test("保存できないボタンは操作名ではなく未確定の状態と台数を示す", () => {
  assert.deepEqual(
    getDeltaSaveControlState({
      canSaveRows: false,
      canSaveDeltaOnly: false,
      pendingReviewCount: 1,
      missingDeltaCount: 2,
    }),
    {
      disabled: true,
      label: "差玉未確定 3台",
    },
  );
  assert.deepEqual(
    getDeltaSaveControlState({
      canSaveRows: true,
      canSaveDeltaOnly: false,
      savableCount: 3,
      machineMissingCount: 2,
    }),
    {
      disabled: true,
      label: "機種未確定 2台",
    },
  );
});

test("70台すべての回転率が計算可能なら通常保存できる", () => {
  assert.deepEqual(
    getDeltaSaveReadiness({
      canSaveRows: true,
      machineAssignmentsValid: true,
      savableCount: 70,
      predictedCount: 70,
    }),
    {
      canSaveDeltaOnly: true,
      allSavableRowsHavePrediction: true,
      needsPredictionData: false,
      canSaveWithRotation: true,
    },
  );
});

test("機種割り当てが不正なら差玉のみ保存も許可しない", () => {
  const readiness = getDeltaSaveReadiness({
    canSaveRows: true,
    machineAssignmentsValid: false,
    savableCount: 70,
    predictedCount: 70,
  });

  assert.equal(readiness.canSaveDeltaOnly, false);
  assert.equal(readiness.needsPredictionData, false);
  assert.equal(readiness.canSaveWithRotation, false);
});
