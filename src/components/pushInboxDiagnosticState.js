export const PUSH_RECHECK_TIMEOUT_MS = 30_000;

const safeTimeoutMs = (value) => (
  Number.isSafeInteger(value) && value >= 0 ? value : PUSH_RECHECK_TIMEOUT_MS
);

export function waitForInboxStatus(promise, timeoutMs = PUSH_RECHECK_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ status: "timed-out" }), safeTimeoutMs(timeoutMs));

    Promise.resolve(promise).then(
      (value) => finish({ status: "resolved", value }),
      () => finish({ status: "rejected" }),
    );
  });
}

const safeSummaryValue = (value) => (
  Number.isSafeInteger(value) && value >= 0 ? value : 0
);

export function toRecentImportSummary(detail) {
  if (!detail || typeof detail !== "object") return null;
  return ["imported", "duplicate", "resolved", "waiting", "rejected", "errors"].reduce((result, key) => {
    result[key] = safeSummaryValue(detail[key]);
    return result;
  }, {});
}

export function getRecheckStatus({ summary, refreshFailed } = {}) {
  if (refreshFailed) {
    return "自動確認は完了しましたが、診断を更新できません。診断を更新してください。";
  }
  const pendingCount = safeSummaryValue(summary?.pending) + safeSummaryValue(summary?.review);
  return pendingCount > 0
    ? "自動確認の結果を更新しました。残る場合は診断情報を確認してください。"
    : "自動確認の結果を更新しました。";
}
