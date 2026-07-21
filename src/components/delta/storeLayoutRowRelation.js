// 店舗管理リストの島範囲を、差玉解析の各行へ台番号単位で対応付ける純粋関数。
//
// - 台数が島全体と一致しなくても、台番号が範囲内なら部分写真を対応付ける。
// - 同じ台番号を含む島が複数ある場合は推測せず ambiguous にする。
// - 資料に既にある機種名は保持し、店舗管理名との不一致を明示する。
// - 店舗管理から補った値は baseValues / appliedValues を記録し、再照合時に
//   店舗設定の変更だけを安全に反映する。利用者が照合後に直した値は基準値へ昇格する。

import { islandToNumbers, normalizeMachineNumber } from "./deltaSelectors.js";

export const STORE_LAYOUT_RELATION_SOURCE = "store-layout";
export const STORE_LAYOUT_RELATION_VERSION = 1;

const RELATION_FIELDS = ["islandId", "island", "machineName"];
const STATUSES = ["matched", "manual-override", "machine-conflict", "ambiguous", "unmapped", "island-only"];

function text(value) {
  return value === null || value === undefined ? "" : String(value);
}

function trimmed(value) {
  return text(value).trim();
}

function normalizedMachineName(value) {
  return trimmed(value)
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/\s+/gu, "");
}

function rowValues(row) {
  return {
    islandId: text(row?.islandId),
    island: text(row?.island),
    machineName: text(row?.machineName),
  };
}

function manualMachineSelection(row) {
  const machineName = trimmed(row?.machineName);
  if (!machineName || row?.machineNameSource !== "manual") return null;
  return {
    machineName,
    islandId: trimmed(row?.islandId),
    number: normalizeMachineNumber(row?.num),
  };
}

function withManualMachineSelection(row, machineName) {
  return {
    ...(row && typeof row === "object" ? row : {}),
    machineName,
    machineNameSource: "manual",
    storeLayoutRelation: row?.storeLayoutRelation
      ? {
        ...row.storeLayoutRelation,
        status: "manual-override",
        manuallySelected: true,
        machineNameApplied: false,
        machineConflict: null,
      }
      : row?.storeLayoutRelation,
  };
}

// 結果画面で選んだ機種名を、同じ台番号の取込確認行へ重ねる。
// 回転数・大当り回数など、取込資料側の値は変更しない。
export function overlayManualMachineSelections(importRows, currentRows) {
  const byNumber = new Map();
  for (const row of Array.isArray(currentRows) ? currentRows : []) {
    const selection = manualMachineSelection(row);
    if (!selection || selection.number === null) continue;
    byNumber.set(selection.number, selection.machineName);
  }
  return (Array.isArray(importRows) ? importRows : []).map((row) => {
    const number = normalizeMachineNumber(row?.num);
    const machineName = number === null ? null : byNumber.get(number);
    return machineName ? withManualMachineSelection(row, machineName) : { ...row };
  });
}

// 取込画面で島の機種を選んだ場合、資料で読めなかった台も含めて結果全体へ反映する。
// 島が未登録の行は、同じ台番号だけへ安全に反映する。
export function propagateManualMachineSelections(rows, sourceRows) {
  const byIslandId = new Map();
  const byNumber = new Map();
  for (const row of Array.isArray(sourceRows) ? sourceRows : []) {
    const selection = manualMachineSelection(row);
    if (!selection) continue;
    if (selection.islandId) byIslandId.set(selection.islandId, selection.machineName);
    if (selection.number !== null) byNumber.set(selection.number, selection.machineName);
  }
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const islandId = trimmed(row?.islandId);
    const number = normalizeMachineNumber(row?.num);
    const machineName = (islandId && byIslandId.get(islandId))
      || (number !== null ? byNumber.get(number) : null);
    return machineName ? withManualMachineSelection(row, machineName) : { ...row };
  });
}

// 直前の店舗照合がそのまま残っている値だけを、保存済みの基準値へ戻す。
// 照合後に利用者や別資料が変更したフィールドは current !== applied になるため、
// その現在値を新しい基準値として保持する。
function relationBaseValues(row) {
  const current = rowValues(row);
  const previous = row?.storeLayoutRelation;
  if (previous?.source !== STORE_LAYOUT_RELATION_SOURCE
    || previous?.version !== STORE_LAYOUT_RELATION_VERSION
    || !previous.baseValues
    || !previous.appliedValues) {
    return current;
  }

  const base = {};
  for (const field of RELATION_FIELDS) {
    const previousApplied = text(previous.appliedValues[field]);
    base[field] = current[field] === previousApplied
      ? text(previous.baseValues[field])
      : current[field];
  }
  return base;
}

function normalizedScope(scope, scopeIslandId) {
  const explicitId = trimmed(scopeIslandId);
  if (explicitId) return { type: "island", islandId: explicitId };

  if (scope && typeof scope === "object") {
    const objectId = trimmed(scope.islandId ?? scope.id);
    return objectId
      ? { type: "island", islandId: objectId }
      : { type: "all", islandId: null };
  }
  const stringScope = trimmed(scope);
  if (!stringScope || stringScope === "all") return { type: "all", islandId: null };
  return { type: "island", islandId: stringScope };
}

function storeIslandCandidates(islands) {
  return (Array.isArray(islands) ? islands : []).flatMap((island, sourceIndex) => {
    if (!island || typeof island !== "object") return [];
    const numbers = islandToNumbers(island)
      .map(normalizeMachineNumber)
      .filter((number) => number !== null);
    if (!numbers.length) return [];
    return [{
      islandId: text(island.id ?? `island-${sourceIndex}`),
      island: trimmed(island.name),
      machineName: trimmed(island.machineName),
      sourceIndex,
      numbers: [...new Set(numbers)],
    }];
  });
}

function numberIndex(candidates) {
  const index = new Map();
  for (const candidate of candidates) {
    for (const number of candidate.numbers) {
      const matches = index.get(number) || [];
      matches.push(candidate);
      index.set(number, matches);
    }
  }
  return index;
}

function relationMetadata({
  status,
  number,
  scope,
  matches,
  baseValues,
  appliedValues,
  machineNameApplied = false,
  machineConflict = null,
}) {
  return {
    source: STORE_LAYOUT_RELATION_SOURCE,
    version: STORE_LAYOUT_RELATION_VERSION,
    status,
    number: number || "",
    scope,
    candidateIslandIds: matches.map((candidate) => candidate.islandId),
    candidateIslands: matches.map((candidate) => candidate.island),
    matchedIslandId: matches.length === 1 ? matches[0].islandId : null,
    matchedIsland: matches.length === 1 ? matches[0].island : "",
    storeMachineName: matches.length === 1 ? matches[0].machineName : "",
    machineNameApplied,
    machineConflict,
    baseValues,
    appliedValues,
  };
}

function relateRow(row, index, scope) {
  const baseValues = relationBaseValues(row);
  const restored = {
    ...(row && typeof row === "object" ? row : {}),
    islandId: baseValues.islandId,
    island: baseValues.island,
    machineName: baseValues.machineName,
  };
  const number = normalizeMachineNumber(row?.num);
  const matches = number === null ? [] : (index.get(number) || []);

  if (matches.length === 0) {
    const appliedValues = rowValues(restored);
    return {
      ...restored,
      storeLayoutRelation: relationMetadata({
        status: "unmapped",
        number,
        scope,
        matches,
        baseValues,
        appliedValues,
      }),
    };
  }

  if (matches.length > 1) {
    const appliedValues = rowValues(restored);
    return {
      ...restored,
      storeLayoutRelation: relationMetadata({
        status: "ambiguous",
        number,
        scope,
        matches,
        baseValues,
        appliedValues,
      }),
    };
  }

  const [candidate] = matches;
  const existingMachineName = trimmed(baseValues.machineName);
  const storeMachineName = candidate.machineName;
  let status = "matched";
  let machineName = baseValues.machineName;
  let machineNameApplied = false;
  let machineConflict = null;

  if (!storeMachineName) {
    status = "island-only";
  } else if (!existingMachineName) {
    machineName = storeMachineName;
    machineNameApplied = true;
  } else if (normalizedMachineName(existingMachineName) !== normalizedMachineName(storeMachineName)) {
    if (row?.machineNameSource === "manual") {
      status = "manual-override";
    } else {
      status = "machine-conflict";
      machineConflict = {
        existingMachineName: baseValues.machineName,
        storeMachineName,
      };
    }
  }

  const related = {
    ...restored,
    islandId: candidate.islandId,
    island: candidate.island,
    machineName,
  };
  const appliedValues = rowValues(related);
  return {
    ...related,
    storeLayoutRelation: relationMetadata({
      status,
      number,
      scope,
      matches,
      baseValues,
      appliedValues,
      machineNameApplied,
      machineConflict,
    }),
  };
}

/**
 * 台番号ごとに店舗管理リストの島を照合する。
 *
 * scope:
 * - "all"（既定）: 全島から照合する。
 * - 島ID文字列 / { islandId }: 指定島だけを照合する。
 * - scopeIslandId: UIから渡しやすい指定島の別名。
 */
export function relateRowsToStoreLayout(rows, {
  islands = [],
  scope = "all",
  scopeIslandId = null,
} = {}) {
  const resolvedScope = normalizedScope(scope, scopeIslandId);
  const candidates = storeIslandCandidates(islands);
  const scopedCandidates = resolvedScope.type === "all"
    ? candidates
    : candidates.filter((candidate) => candidate.islandId === resolvedScope.islandId);
  const index = numberIndex(scopedCandidates);
  const relatedRows = (Array.isArray(rows) ? rows : [])
    .map((row) => relateRow(row, index, resolvedScope));
  const statusCounts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  for (const row of relatedRows) {
    const status = row.storeLayoutRelation.status;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }

  return {
    rows: relatedRows,
    summary: {
      totalCount: relatedRows.length,
      scope: resolvedScope,
      scopeFound: resolvedScope.type === "all"
        || candidates.some((candidate) => candidate.islandId === resolvedScope.islandId),
      islandCount: scopedCandidates.length,
      mappedCount: statusCounts.matched
        + statusCounts["manual-override"]
        + statusCounts["machine-conflict"]
        + statusCounts["island-only"],
      reviewCount: statusCounts["machine-conflict"]
        + statusCounts.ambiguous
        + statusCounts.unmapped,
      statusCounts,
    },
  };
}
