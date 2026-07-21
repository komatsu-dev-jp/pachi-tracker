// サイトセブン表の台番号を、選択済みの店舗・島から
// 「表に並ぶ順番」の期待値へ整える。写真OCRの推測だけに依存しないための入口。

import { islandToNumbers, normalizeMachineNumber } from "./deltaSelectors.js";

function uniqueSortedMachineNumbers(values) {
  const unique = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeMachineNumber(value);
    if (normalized !== null) unique.add(normalized);
  }
  return [...unique].sort((left, right) => Number(left) - Number(right));
}

export function buildStoreScopeExpectedNumbers(islands, scopeId = "all") {
  const list = Array.isArray(islands) ? islands : [];
  const normalizedScope = String(scopeId ?? "all");
  const selected = normalizedScope === "all"
    ? list
    : list.filter((island, index) => (
      String(island?.id ?? `island-${index}`) === normalizedScope
    ));
  return uniqueSortedMachineNumbers(selected.flatMap((island) => islandToNumbers(island)));
}
