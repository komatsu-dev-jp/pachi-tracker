import assert from "node:assert/strict";
import test from "node:test";
import {
  createDeltaCompletionHistoryGuard,
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
