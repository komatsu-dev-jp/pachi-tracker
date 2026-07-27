export const DELTA_EVENT_OPTIONS = Object.freeze([
  { value: "", label: "通常日" },
  { value: "old-event", label: "旧イベント日" },
  { value: "special-day", label: "特定日" },
  { value: "store-event", label: "店舗イベント" },
]);

const EVENT_LABELS = Object.freeze(Object.fromEntries(
  DELTA_EVENT_OPTIONS.map((option) => [option.value, option.label]),
));

export function deltaEventLabel(eventType = "") {
  return EVENT_LABELS[String(eventType || "").trim()] || "未設定";
}

export function deltaIslandScopeLabel(islands = [], islandScopeId = "all") {
  if (islandScopeId === "all") return "店舗全体（台番号から自動判定）";
  const list = Array.isArray(islands) ? islands : [];
  const island = list.find((item, index) => (
    String(item?.id ?? `island-${index}`) === String(islandScopeId)
  ));
  if (!island) return "店舗全体（台番号から自動判定）";
  return String(island.name || "名称未設定の島");
}

export function buildDeltaAnalysisConfirmation({
  storeName = "",
  analysisDate = "",
  eventType = "",
  islands = [],
  islandScopeId = "all",
  fileCount = 0,
} = {}) {
  const count = Math.max(0, Number.parseInt(fileCount, 10) || 0);
  return {
    title: "解析内容を確認してください",
    message: [
      "次の内容で差玉解析を開始します。",
      "",
      `店舗：${String(storeName || "").trim() || "未選択"}`,
      `日付：${String(analysisDate || "").trim() || "未設定"}`,
      `イベント：${deltaEventLabel(eventType)}`,
      `解析範囲：${deltaIslandScopeLabel(islands, islandScopeId)}`,
      `追加資料：${count}件`,
      "",
      "日付・イベント・店舗に誤りがないか、もう一度確認してください。",
    ].join("\n"),
    confirmLabel: "この内容で解析",
    cancelLabel: "入力内容を見直す",
  };
}
