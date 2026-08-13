export const GUARDED_SESSION_CONTEXT = Object.freeze([
  "店舗",
  "機種",
  "台番号",
  "貸玉",
  "交換率",
  "機種スペック",
  "ボーダー",
  "店舗の閉店時刻",
]);

export const QUICK_START_EDITABLE_CONTEXT = Object.freeze(["店舗", "機種", "台番号"]);

export function isQuickStartEditableContext(labels) {
  const requested = (Array.isArray(labels) ? labels : [labels])
    .map((label) => String(label || "").trim())
    .filter(Boolean);
  return requested.length > 0 && requested.every((label) => QUICK_START_EDITABLE_CONTEXT.includes(label));
}

export function shouldBlockSessionContextChange(sessionStarted, {
  quickStartSession = false,
  labels = [],
} = {}) {
  return sessionStarted === true && !(quickStartSession === true && isQuickStartEditableContext(labels));
}

export function mergeSessionContextRequest(previous, labels) {
  const additions = (Array.isArray(labels) ? labels : [labels])
    .map((label) => String(label || "").trim())
    .filter(Boolean);
  return {
    labels: [...new Set([...(previous?.labels || []), ...additions])],
  };
}
