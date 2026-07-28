const HISTORY_STATE_KEY = "ptDeltaSaveCompletion";

function safeState(value) {
  return value && typeof value === "object" ? value : {};
}

/**
 * 保存完了画面に端末の「戻る」用の履歴を1件だけ追加する。
 * 戻る操作ではアプリ外へ抜けず、差玉解析トップへ戻す。
 */
export function createDeltaCompletionHistoryGuard({
  windowObject,
  onBack,
  fallbackDelayMs = 250,
} = {}) {
  const win = windowObject;
  const history = win?.history;
  if (
    !win
    || !history
    || typeof history.pushState !== "function"
    || typeof history.back !== "function"
    || typeof win.addEventListener !== "function"
  ) {
    return {
      run(action) {
        if (typeof action === "function") action();
      },
      dispose() {},
    };
  }

  const token = `delta-complete-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let active = true;
  let pendingAction = null;
  let fallbackTimer = null;

  const clearFallback = () => {
    if (fallbackTimer == null) return;
    win.clearTimeout?.(fallbackTimer);
    fallbackTimer = null;
  };
  const finish = (action) => {
    if (!active) return;
    active = false;
    clearFallback();
    const next = typeof action === "function" ? action : onBack;
    pendingAction = null;
    next?.();
  };
  const handlePopState = () => {
    finish(pendingAction);
  };

  history.pushState(
    { ...safeState(history.state), [HISTORY_STATE_KEY]: token },
    "",
    win.location?.href,
  );
  win.addEventListener("popstate", handlePopState);

  return {
    run(action) {
      if (!active) {
        action?.();
        return;
      }
      const markerIsCurrent = history.state?.[HISTORY_STATE_KEY] === token;
      if (!markerIsCurrent) {
        finish(action);
        return;
      }
      pendingAction = action;
      if (typeof win.setTimeout === "function") {
        fallbackTimer = win.setTimeout(() => finish(action), fallbackDelayMs);
      }
      history.back();
    },
    dispose() {
      clearFallback();
      active = false;
      pendingAction = null;
      win.removeEventListener?.("popstate", handlePopState);
    },
  };
}

export function makeDeltaCompletionSummary({ scan, validation } = {}) {
  return {
    scanId: String(scan?.id || ""),
    storeName: String(scan?.storeName || ""),
    date: String(scan?.date || ""),
    savedCount: Math.max(0, Number(validation?.savableCount) || 0),
    excludedCount: Math.max(0, Number(validation?.excludedCount) || 0),
  };
}

export function getDeltaSaveReadiness({
  canSaveRows = false,
  machineAssignmentsValid = false,
  savableCount = 0,
  predictedCount = 0,
} = {}) {
  const normalizedSavableCount = Math.max(0, Number(savableCount) || 0);
  const normalizedPredictedCount = Math.max(0, Number(predictedCount) || 0);
  const canSaveDeltaOnly = Boolean(canSaveRows && machineAssignmentsValid);
  const allSavableRowsHavePrediction = canSaveDeltaOnly
    && normalizedSavableCount > 0
    && normalizedPredictedCount === normalizedSavableCount;

  return {
    canSaveDeltaOnly,
    allSavableRowsHavePrediction,
    needsPredictionData: canSaveDeltaOnly && !allSavableRowsHavePrediction,
    canSaveWithRotation: allSavableRowsHavePrediction,
  };
}
