// 店舗のホールマップと、グラフごとの信頼済み台番号を安全に対応付ける純粋関数。
//
// ホールマップは台番号の候補を提示する補助資料としてだけ使う。
// OCR／共同照合で固定済みの番号は上書きせず、候補が一意でも利用者の
// 目視確認が終わるまでは自動確定扱いにしない。

import { islandToNumbers } from "./deltaSelectors.js";
import { trustedMachineNumberForSlot } from "./deltaWorkflowState.js";

const MAX_STORE_CANDIDATE_NUMBERS = 10_000;

function normalizeMachineNumber(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/u.test(text)) return "";
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? String(parsed) : "";
}

function uniqueNumbers(values) {
  const seen = new Set();
  const numbers = [];
  for (const value of Array.isArray(values) ? values : []) {
    const number = normalizeMachineNumber(value);
    if (!number || seen.has(number)) continue;
    seen.add(number);
    numbers.push(number);
  }
  return numbers;
}

function candidateName(island, index) {
  const name = String(island?.name || "").trim();
  if (name) return name;
  return `${index + 1}島`;
}

// islandToNumbers は重複範囲を集合として正規化するため、元設定の重なりを
// 別途検出する。設定不備を「実在台が少ない島」と誤解して採用しないための検査。
function hasSafeIslandNumberConfiguration(island) {
  const ranges = Array.isArray(island?.ranges) && island.ranges.length > 0
    ? island.ranges
    : [{ start: island?.start, end: island?.end }];
  const gaps = new Set((Array.isArray(island?.gaps) ? island.gaps : [])
    .map(Number)
    .filter((number) => Number.isSafeInteger(number) && number > 0));
  const seen = new Set();
  let expandedCount = 0;
  for (const range of ranges) {
    const start = Number(range?.start);
    const end = Number(range?.end);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start <= 0 || end <= 0) {
      return false;
    }
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    expandedCount += high - low + 1;
    if (expandedCount > MAX_STORE_CANDIDATE_NUMBERS) return false;
    for (let number = low; number <= high; number += 1) {
      if (gaps.has(number)) continue;
      if (seen.has(number)) return false;
      seen.add(number);
    }
  }
  return seen.size > 0;
}

/**
 * 店舗の各島を、差玉解析で比較できる台番号候補へ変換する。
 * ranges（飛び番号）と gaps（欠け台）は islandToNumbers で反映され、
 * データサイトの掲載順に合わせた昇順になる。
 */
export function buildStoreMachineNumberCandidates(islands) {
  return (Array.isArray(islands) ? islands : []).flatMap((island, index) => {
    if (!island || typeof island !== "object") return [];
    if (!hasSafeIslandNumberConfiguration(island)) return [];
    const numbers = uniqueNumbers(islandToNumbers(island));
    if (!numbers.length) return [];
    const name = candidateName(island, index);
    const machineName = String(island.machineName || "").trim();
    return [{
      candidateId: String(island.id ?? `island-${index}`),
      candidateName: name,
      candidateLabel: machineName
        ? `${name}・${machineName}`
        : name,
      machineName,
      sourceIndex: index,
      numbers,
      numberCount: numbers.length,
    }];
  });
}

/**
 * 各slotの共同照合／OCRで固定済みの番号を取り出す。
 * jointOnly=true のときは、共同照合中の単独OCR候補を固定点にしない。
 */
export function trustedStoreRelationNumbers(slots, { jointOnly = false } = {}) {
  return (Array.isArray(slots) ? slots : []).map((slot) => (
    normalizeMachineNumber(trustedMachineNumberForSlot(slot, { jointOnly }))
  ));
}

/**
 * slot数が一致し、固定済み番号が同じindexで矛盾しない島だけを残す。
 * 同じ番号を含むだけでは不十分で、画像内の対応位置まで一致させる。
 */
export function findCompatibleStoreMachineNumberCandidates({
  candidates = [],
  slots = [],
  jointOnly = false,
} = {}) {
  const sourceSlots = Array.isArray(slots) ? slots : [];
  const fixedNumbers = trustedStoreRelationNumbers(sourceSlots, { jointOnly });
  const compatibleCandidates = [];
  const rejectedCandidates = [];

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const numbers = uniqueNumbers(candidate?.numbers);
    const countMatches = numbers.length === sourceSlots.length;
    const conflictIndices = [];
    if (countMatches) {
      fixedNumbers.forEach((fixedNumber, index) => {
        if (fixedNumber && numbers[index] !== fixedNumber) conflictIndices.push(index);
      });
    }
    const relation = {
      ...candidate,
      numbers,
      numberCount: numbers.length,
      countMatches,
      fixedMatchCount: fixedNumbers.filter((number, index) => (
        Boolean(number) && numbers[index] === number
      )).length,
      conflictIndices,
    };
    if (countMatches && conflictIndices.length === 0) compatibleCandidates.push(relation);
    else rejectedCandidates.push(relation);
  }

  return {
    slotCount: sourceSlots.length,
    fixedNumbers,
    fixedIndices: fixedNumbers.reduce((indices, number, index) => {
      if (number) indices.push(index);
      return indices;
    }, []),
    compatibleCandidates,
    rejectedCandidates,
  };
}

/**
 * 一意に残った島候補から、未解決slotだけの補助入力値を作る。
 * fixed indexは返却対象に含めないため、固定点を上書きできない。
 */
export function buildUniqueStoreMachineNumberSuggestion(relation) {
  const compatible = Array.isArray(relation?.compatibleCandidates)
    ? relation.compatibleCandidates
    : [];
  if (compatible.length !== 1) {
    return {
      available: false,
      reason: compatible.length === 0
        ? "no-compatible-candidate"
        : "multiple-compatible-candidates",
      autoConfirmed: false,
      manualVerificationRequired: true,
      suggestedManualNumbersByIndex: {},
      suggestions: [],
    };
  }

  const candidate = compatible[0];
  const fixedNumbers = Array.isArray(relation?.fixedNumbers) ? relation.fixedNumbers : [];
  const suggestedManualNumbersByIndex = {};
  const unresolvedIndices = [];
  const suggestions = [];
  candidate.numbers.forEach((number, index) => {
    if (fixedNumbers[index]) return;
    unresolvedIndices.push(index);
    suggestedManualNumbersByIndex[index] = number;
    suggestions.push({
      slotIndex: index,
      suggestedNumber: number,
      source: "store-map",
      requiresReview: true,
    });
  });

  return {
    available: true,
    reason: "unique-compatible-candidate",
    candidateId: candidate.candidateId,
    candidateName: candidate.candidateName,
    candidateLabel: candidate.candidateLabel,
    numbers: [...candidate.numbers],
    unresolvedIndices,
    suggestedManualNumbersByIndex,
    suggestions,
    basis: fixedNumbers.some(Boolean) ? "fixed-index" : "count-only",
    // UI側はこの値を手入力欄の初期候補にだけ使い、確定操作は必ず別に行う。
    autoConfirmed: false,
    manualVerificationRequired: true,
  };
}

/**
 * 確定済み配列と1つの店舗候補を比較する。
 * 同じ集合でも順番が入れ替わっていれば exact=false とし、1台ずれを通さない。
 */
export function compareConfirmedMachineNumbers(confirmedNumbers, candidateNumbers) {
  const rawConfirmed = Array.isArray(confirmedNumbers) ? confirmedNumbers : [];
  const normalizedConfirmed = rawConfirmed.map(normalizeMachineNumber);
  const normalizedCandidate = (Array.isArray(candidateNumbers) ? candidateNumbers : [])
    .map(normalizeMachineNumber);
  const blankIndices = [];
  const invalidIndices = [];
  rawConfirmed.forEach((value, index) => {
    if (String(value ?? "").trim() === "") blankIndices.push(index);
    else if (!normalizedConfirmed[index]) invalidIndices.push(index);
  });
  const confirmed = uniqueNumbers(normalizedConfirmed);
  const candidate = uniqueNumbers(normalizedCandidate);
  const confirmedSet = new Set(confirmed);
  const candidateSet = new Set(candidate);
  const duplicateNumbers = [...new Set(normalizedConfirmed.filter((number, index) => (
    number && normalizedConfirmed.indexOf(number) !== index
  )))];
  const matchedNumbers = candidate.filter((number) => confirmedSet.has(number));
  const missingNumbers = candidate.filter((number) => !confirmedSet.has(number));
  const extraNumbers = confirmed.filter((number) => !candidateSet.has(number));
  const indexMismatches = [];
  const comparisonLength = Math.min(normalizedConfirmed.length, normalizedCandidate.length);
  for (let index = 0; index < comparisonLength; index += 1) {
    const actual = normalizedConfirmed[index];
    const expected = normalizedCandidate[index];
    if (actual && expected && actual !== expected) {
      indexMismatches.push({ index, actual, expected });
    }
  }
  const complete = rawConfirmed.length === normalizedCandidate.length
    && blankIndices.length === 0
    && invalidIndices.length === 0
    && duplicateNumbers.length === 0;
  const sameSet = complete && missingNumbers.length === 0 && extraNumbers.length === 0;
  const sameOrder = complete && normalizedCandidate.every((number, index) => (
    number && normalizedConfirmed[index] === number
  ));
  return {
    complete,
    exact: complete && sameSet && sameOrder,
    sameSet,
    sameOrder,
    matchedNumbers,
    missingNumbers,
    extraNumbers,
    blankIndices,
    invalidIndices,
    duplicateNumbers,
    indexMismatches,
  };
}

/**
 * 利用者が確定した全台番号と、店舗の各島候補を集合・順序の両方で比較する。
 */
export function summarizeStoreMachineNumberRelations(confirmedNumbers, candidates) {
  const confirmed = uniqueNumbers(confirmedNumbers);

  const candidateSummaries = (Array.isArray(candidates) ? candidates : []).map((candidate) => {
    const numbers = uniqueNumbers(candidate?.numbers);
    const comparison = compareConfirmedMachineNumbers(confirmedNumbers, numbers);
    return {
      candidateId: candidate.candidateId,
      candidateName: candidate.candidateName,
      candidateLabel: candidate.candidateLabel || candidate.candidateName,
      candidateCount: numbers.length,
      confirmedCount: confirmed.length,
      matchCount: comparison.matchedNumbers.length,
      matchedNumbers: comparison.matchedNumbers,
      missingNumbers: comparison.missingNumbers,
      extraNumbers: comparison.extraNumbers,
      orderMismatchIndices: comparison.indexMismatches.map(({ index }) => index),
      indexMismatches: comparison.indexMismatches,
      exactSetMatch: comparison.sameSet,
      exactOrderMatch: comparison.sameOrder,
      exact: comparison.exact,
    };
  });

  const bestMatchCount = candidateSummaries.length
    ? Math.max(...candidateSummaries.map((summary) => summary.matchCount))
    : 0;
  const bestCandidateNames = candidateSummaries
    .filter((summary) => summary.matchCount === bestMatchCount)
    .map((summary) => summary.candidateName);

  return {
    confirmedNumbers: confirmed,
    confirmedCount: confirmed.length,
    duplicateConfirmedNumbers: compareConfirmedMachineNumbers(confirmedNumbers, [])
      .duplicateNumbers,
    candidateNames: candidateSummaries.map((summary) => summary.candidateName),
    bestMatchCount,
    bestCandidateNames,
    candidateSummaries,
  };
}

/**
 * 画面側から1回で利用できる統合結果を返す。
 */
export function buildStoreMachineNumberRelation({
  islands = [],
  slots = [],
  confirmedNumbers,
  jointOnly = false,
} = {}) {
  const candidates = buildStoreMachineNumberCandidates(islands);
  const compatibility = findCompatibleStoreMachineNumberCandidates({
    candidates,
    slots,
    jointOnly,
  });
  const suggestion = buildUniqueStoreMachineNumberSuggestion(compatibility);
  const numbersForSummary = Array.isArray(confirmedNumbers)
    ? confirmedNumbers
    : compatibility.fixedNumbers;
  return {
    candidates,
    ...compatibility,
    suggestion,
    summary: summarizeStoreMachineNumberRelations(numbersForSummary, candidates),
  };
}
