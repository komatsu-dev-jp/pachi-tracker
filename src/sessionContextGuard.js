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

export function shouldBlockSessionContextChange(sessionStarted) {
  return sessionStarted === true;
}

export function mergeSessionContextRequest(previous, labels) {
  const additions = (Array.isArray(labels) ? labels : [labels])
    .map((label) => String(label || "").trim())
    .filter(Boolean);
  return {
    labels: [...new Set([...(previous?.labels || []), ...additions])],
  };
}
