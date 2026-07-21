// サイトセブンのグラフ枠と表行を、配列位置ではなく観測値で1対1照合する純粋関数。
// 台番号・最高出玉は各OCRが独立して確定した値だけを利用し、近似値では照合しない。

function toAsciiDigits(value) {
  return String(value ?? "").replace(/[０-９]/gu, (digit) => (
    String.fromCharCode(digit.charCodeAt(0) - 0xFEE0)
  ));
}

function normalizeMachineNumber(value) {
  const text = toAsciiDigits(value).trim();
  if (!/^\d+$/u.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? String(parsed) : null;
}

function normalizeMaxPayout(value) {
  const text = toAsciiDigits(value)
    .replace(/[，,\s]/gu, "")
    .replace(/玉$/u, "");
  if (!/^\d+$/u.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function finiteOrder(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizedNumberCandidates(values) {
  return [...new Set(values.map(normalizeMachineNumber).filter((value) => value !== null))];
}

function graphEntry(graphPanel, index) {
  const observedCandidate = normalizeMachineNumber(graphPanel?.observedNumCandidate);
  const fallbackNumber = normalizeMachineNumber(graphPanel?.num);
  const rawNum = observedCandidate ?? fallbackNumber;
  const rawMaxPayout = normalizeMaxPayout(graphPanel?.maxPayout);
  return {
    item: graphPanel,
    index,
    id: String(graphPanel?.panelId ?? `graph-${index}`),
    rawNum,
    rawNumCandidates: normalizedNumberCandidates([rawNum]),
    trustedNum: graphPanel?.machineNumberAccepted === true ? rawNum : null,
    rawMaxPayout,
    trustedMaxPayout: graphPanel?.maxPayoutAccepted === true ? rawMaxPayout : null,
    pageIndex: finiteOrder(graphPanel?.pageIndex, 0),
    rowIndex: finiteOrder(graphPanel?.rowIndex, index),
    colIndex: finiteOrder(graphPanel?.colIndex, 0),
  };
}

function tableEntry(tableRow, index) {
  const rawNum = normalizeMachineNumber(tableRow?.num);
  const rawNumCandidates = normalizedNumberCandidates([
    rawNum,
    tableRow?.machineNumberSuggested,
    tableRow?.machineNumberObserved,
  ]);
  const rawMaxPayout = normalizeMaxPayout(tableRow?.maxPayout);
  return {
    item: tableRow,
    index,
    id: String(tableRow?.rowId ?? `row-${index}`),
    rawNum,
    rawNumCandidates,
    trustedNum: tableRow?.numAccepted === true
      && tableRow?.jointEvidenceRejected !== true ? rawNum : null,
    rawMaxPayout,
    trustedMaxPayout: tableRow?.maxPayoutAccepted === true
      && tableRow?.jointEvidenceRejected !== true ? rawMaxPayout : null,
    sourceIndex: finiteOrder(tableRow?.sourceIndex, 0),
    rowIndex: finiteOrder(tableRow?.rowIndex, index),
  };
}

function groupBy(entries, keyName) {
  const groups = new Map();
  for (const entry of entries) {
    const value = entry[keyName];
    if (value === null) continue;
    const group = groups.get(value) || [];
    group.push(entry);
    groups.set(value, group);
  }
  return groups;
}

function duplicateValues(groups) {
  return [...groups.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([value]) => value)
    .sort(compareValues);
}

function uniqueValueCount(groups) {
  return [...groups.values()].filter((entries) => entries.length === 1).length;
}

function compareValues(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return String(left).localeCompare(String(right));
}

function compareGraphs(left, right) {
  return left.pageIndex - right.pageIndex
    || left.rowIndex - right.rowIndex
    || left.colIndex - right.colIndex
    || left.id.localeCompare(right.id);
}

function compareRows(left, right) {
  return left.sourceIndex - right.sourceIndex
    || left.rowIndex - right.rowIndex
    || left.id.localeCompare(right.id);
}

function reasonMessage(code) {
  const messages = {
    "duplicate-graph-number": "グラフ側で同じ台番号が重複しています",
    "duplicate-table-number": "表側で同じ台番号が重複しています",
    "max-payout-conflict": "同じ台番号ですが最高出玉が一致しません",
    "number-conflict": "同じ最高出玉ですが確定済み台番号が一致しません",
    "number-candidate-conflict": "最高出玉は一致しますが低信頼の台番号候補が矛盾しています",
    "duplicate-max-payout-needs-number": "最高出玉が重複するため、最高出玉だけでは台を確定できません",
    "anchored-max-ambiguous": "前後の確定台の間に同じ最高出玉の候補が複数あります",
    "max-payout-without-trusted-number": "最高出玉は一意ですが、確定済み台番号がありません",
    "order-inversion": "画像内の並び順が表の並び順と逆転しています",
    "unmatched-graph": "対応する表行を一意に確認できません",
    "unmatched-table-row": "対応するグラフを一意に確認できません",
  };
  return messages[code] || code;
}

function sortedIds(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}

/**
 * グラフ枠と表行を台番号・最高出玉の完全一致だけで安全に対応付ける。
 * 順序は矛盾の検出にのみ使い、行番号から台番号を割り当てない。
 * matches には自動確定可能な組み合わせだけを返し、曖昧な行は unmatched と
 * reviewReasons に残す。graphIndex / tableIndex は入力配列上の位置を表す。
 */
export function matchSiteSevenGraphPanels(graphPanels, tableRows) {
  const graphs = (Array.isArray(graphPanels) ? graphPanels : []).map(graphEntry);
  const rows = (Array.isArray(tableRows) ? tableRows : []).map(tableEntry);
  const graphNumGroups = groupBy(graphs, "trustedNum");
  const rowNumGroups = groupBy(rows, "trustedNum");
  const graphMaxGroups = groupBy(graphs, "trustedMaxPayout");
  const rowMaxGroups = groupBy(rows, "trustedMaxPayout");
  const duplicateGraphNumbers = duplicateValues(graphNumGroups);
  const duplicateTableNumbers = duplicateValues(rowNumGroups);
  const duplicateGraphMaxPayouts = duplicateValues(graphMaxGroups);
  const duplicateTableMaxPayouts = duplicateValues(rowMaxGroups);

  const reviewReasons = [];
  const reasonKeys = new Set();
  // 同じ台番号なのに最高出玉が違う等の強い矛盾は、別の証拠経路で迂回して
  // 「accepted」へ戻してはいけない。対象の枠・行・確定番号を以後の照合から隔離する。
  const hardConflictGraphIndices = new Set();
  const hardConflictRowIndices = new Set();
  const hardConflictNumbers = new Set();
  const markHardConflict = ({ graphEntries = [], rowEntries = [], nums = [] }) => {
    for (const graph of graphEntries) hardConflictGraphIndices.add(graph.index);
    for (const row of rowEntries) hardConflictRowIndices.add(row.index);
    for (const num of nums) {
      const normalized = normalizeMachineNumber(num);
      if (normalized !== null) hardConflictNumbers.add(normalized);
    }
  };
  const addReason = ({ code, graphEntries = [], rowEntries = [], num = null, maxPayout = null }) => {
    const graphIds = sortedIds(graphEntries.map((entry) => entry.id));
    const rowIds = sortedIds(rowEntries.map((entry) => entry.id));
    const key = JSON.stringify([code, graphIds, rowIds, num, maxPayout]);
    if (reasonKeys.has(key)) return;
    reasonKeys.add(key);
    reviewReasons.push({
      code,
      message: reasonMessage(code),
      graphIds,
      rowIds,
      ...(num !== null ? { num: String(num) } : {}),
      ...(maxPayout !== null ? { maxPayout: Number(maxPayout) } : {}),
    });
  };

  for (const num of duplicateGraphNumbers) {
    const graphEntries = graphNumGroups.get(num);
    markHardConflict({ graphEntries, nums: [num] });
    addReason({ code: "duplicate-graph-number", graphEntries, num });
  }
  for (const num of duplicateTableNumbers) {
    const rowEntries = rowNumGroups.get(num);
    markHardConflict({ rowEntries, nums: [num] });
    addReason({ code: "duplicate-table-number", rowEntries, num });
  }

  const usedGraphIndices = new Set();
  const usedRowIndices = new Set();
  const matches = [];
  const addMatch = (graph, row, matchType, num, maxPayout = null) => {
    if (usedGraphIndices.has(graph.index) || usedRowIndices.has(row.index)) return false;
    if (hardConflictGraphIndices.has(graph.index)
      || hardConflictRowIndices.has(row.index)
      || hardConflictNumbers.has(String(num))) return false;
    usedGraphIndices.add(graph.index);
    usedRowIndices.add(row.index);
    const matchedBy = matchType === "num-and-max-exact"
      ? "num+max"
      : matchType === "num-exact"
        ? "num"
        : matchType === "unique-max-exact"
          ? "unique-max"
          : "anchored-duplicate-max";
    matches.push({
      graphIndex: graph.index,
      tableIndex: row.index,
      graphId: graph.id,
      panelId: graph.id,
      rowId: row.id,
      graphPanel: graph.item,
      tableRow: row.item,
      resolvedNum: String(num),
      num: String(num),
      maxPayout,
      matchedBy,
      matchType,
      accepted: true,
    });
    return true;
  };

  // 第1固定点: 双方で一意な台番号。最高出玉も確定済みなら完全一致を必須とする。
  const sharedNumbers = [...graphNumGroups.keys()]
    .filter((num) => rowNumGroups.has(num))
    .sort(compareValues);
  for (const num of sharedNumbers) {
    const graphGroup = graphNumGroups.get(num);
    const rowGroup = rowNumGroups.get(num);
    if (graphGroup.length !== 1 || rowGroup.length !== 1) continue;
    const graph = graphGroup[0];
    const row = rowGroup[0];
    const graphMax = graph.trustedMaxPayout;
    const rowMax = row.trustedMaxPayout;
    if (graphMax !== null && rowMax !== null && graphMax !== rowMax) {
      markHardConflict({ graphEntries: [graph], rowEntries: [row], nums: [num] });
      addReason({ code: "max-payout-conflict", graphEntries: [graph], rowEntries: [row], num });
      continue;
    }
    const hasExactMax = graphMax !== null && rowMax !== null;
    addMatch(graph, row, hasExactMax ? "num-and-max-exact" : "num-exact", num, hasExactMax ? graphMax : null);
  }

  // 第2固定点: 全資料で一意な最高出玉。片側だけ欠けた台番号を補助できるが、
  // 確定番号同士または低信頼候補が矛盾する場合は自動確定しない。
  const sharedMaxPayouts = [...graphMaxGroups.keys()]
    .filter((maxPayout) => rowMaxGroups.has(maxPayout))
    .sort(compareValues);
  for (const maxPayout of sharedMaxPayouts) {
    const graphGroup = graphMaxGroups.get(maxPayout);
    const rowGroup = rowMaxGroups.get(maxPayout);
    if (graphGroup.length !== 1 || rowGroup.length !== 1) continue;
    const graph = graphGroup[0];
    const row = rowGroup[0];
    if (usedGraphIndices.has(graph.index) || usedRowIndices.has(row.index)) continue;

    if (graph.trustedNum !== null && row.trustedNum !== null) {
      if (graph.trustedNum !== row.trustedNum) {
        markHardConflict({
          graphEntries: [graph],
          rowEntries: [row],
          nums: [graph.trustedNum, row.trustedNum],
        });
        addReason({
          code: "number-conflict",
          graphEntries: [graph],
          rowEntries: [row],
          maxPayout,
        });
      }
      // 同じ番号でも重複番号を最高出玉で迂回して確定しない。
      continue;
    }

    const trustedNum = graph.trustedNum ?? row.trustedNum;
    if (trustedNum === null) {
      addReason({
        code: "max-payout-without-trusted-number",
        graphEntries: [graph],
        rowEntries: [row],
        maxPayout,
      });
      continue;
    }

    const untrustedRawNumbers = graph.trustedNum === null
      ? graph.rawNumCandidates
      : row.rawNumCandidates;
    if (untrustedRawNumbers.some((candidate) => candidate !== trustedNum)) {
      markHardConflict({ graphEntries: [graph], rowEntries: [row], nums: [trustedNum] });
      addReason({
        code: "number-candidate-conflict",
        graphEntries: [graph],
        rowEntries: [row],
        num: trustedNum,
        maxPayout,
      });
      continue;
    }

    const trustedGroup = graph.trustedNum !== null
      ? graphNumGroups.get(trustedNum)
      : rowNumGroups.get(trustedNum);
    if ((trustedGroup?.length || 0) !== 1) continue;
    addMatch(graph, row, "unique-max-exact", trustedNum, maxPayout);
  }

  const graphPages = new Map();
  for (const graph of graphs) {
    const page = graphPages.get(graph.pageIndex) || [];
    page.push(graph);
    graphPages.set(graph.pageIndex, page);
  }
  for (const page of graphPages.values()) page.sort(compareGraphs);

  const matchByGraphIndex = () => new Map(matches.map((match) => [match.graphIndex, match]));
  const matchedRowEntry = (match) => rows[match.tableIndex];
  const hasAcceptedOrderInversion = (page, byGraphIndex) => {
    const anchors = page
      .map((graph) => ({ graph, match: byGraphIndex.get(graph.index) }))
      .filter((entry) => entry.match)
      .map((entry) => ({ ...entry, row: matchedRowEntry(entry.match) }));
    for (let index = 1; index < anchors.length; index += 1) {
      const previous = anchors[index - 1];
      const current = anchors[index];
      if (previous.row.sourceIndex !== current.row.sourceIndex) continue;
      if (current.row.rowIndex > previous.row.rowIndex) continue;
      addReason({
        code: "order-inversion",
        graphEntries: [previous.graph, current.graph],
        rowEntries: [previous.row, current.row],
      });
      return true;
    }
    return false;
  };

  // 第3固定点: 重複する最高出玉は、同一ページの物理順で直前・直後の確定台が
  // 同一表資料内の順方向anchorになり、その間の未使用候補が1行だけの時に限り確定する。
  // 1件確定するたびにanchorを作り直し、連鎖的に一意になった枠だけを反復して解く。
  let anchoredProgress = true;
  while (anchoredProgress) {
    anchoredProgress = false;
    const byGraphIndex = matchByGraphIndex();
    const orderedPages = [...graphPages.entries()].sort(([left], [right]) => left - right);
    for (const [, page] of orderedPages) {
      if (hasAcceptedOrderInversion(page, byGraphIndex)) continue;
      for (let graphPosition = 0; graphPosition < page.length; graphPosition += 1) {
        const graph = page[graphPosition];
        if (usedGraphIndices.has(graph.index) || graph.trustedMaxPayout === null) continue;

        let previousMatch = null;
        let previousGraph = null;
        for (let index = graphPosition - 1; index >= 0; index -= 1) {
          const candidate = byGraphIndex.get(page[index].index);
          if (!candidate) continue;
          previousMatch = candidate;
          previousGraph = page[index];
          break;
        }
        let nextMatch = null;
        let nextGraph = null;
        for (let index = graphPosition + 1; index < page.length; index += 1) {
          const candidate = byGraphIndex.get(page[index].index);
          if (!candidate) continue;
          nextMatch = candidate;
          nextGraph = page[index];
          break;
        }
        if (!previousMatch || !nextMatch) continue;

        const previousRow = matchedRowEntry(previousMatch);
        const nextRow = matchedRowEntry(nextMatch);
        if (previousRow.sourceIndex !== nextRow.sourceIndex) continue;
        if (previousRow.rowIndex >= nextRow.rowIndex) {
          addReason({
            code: "order-inversion",
            graphEntries: [previousGraph, nextGraph],
            rowEntries: [previousRow, nextRow],
          });
          continue;
        }

        const candidates = rows.filter((row) => (
          !usedRowIndices.has(row.index)
          && row.sourceIndex === previousRow.sourceIndex
          && row.rowIndex > previousRow.rowIndex
          && row.rowIndex < nextRow.rowIndex
          && row.trustedMaxPayout === graph.trustedMaxPayout
        ));
        if (candidates.length !== 1) {
          continue;
        }

        const row = candidates[0];
        if (graph.trustedNum !== null && row.trustedNum !== null
          && graph.trustedNum !== row.trustedNum) {
          markHardConflict({
            graphEntries: [graph],
            rowEntries: [row],
            nums: [graph.trustedNum, row.trustedNum],
          });
          addReason({
            code: "number-conflict",
            graphEntries: [graph],
            rowEntries: [row],
            maxPayout: graph.trustedMaxPayout,
          });
          continue;
        }
        const trustedNum = graph.trustedNum ?? row.trustedNum;
        if (trustedNum === null) continue;
        const untrustedRawNumbers = graph.trustedNum === null
          ? graph.rawNumCandidates
          : row.rawNumCandidates;
        if (untrustedRawNumbers.some((candidate) => candidate !== trustedNum)) {
          markHardConflict({ graphEntries: [graph], rowEntries: [row], nums: [trustedNum] });
          addReason({
            code: "number-candidate-conflict",
            graphEntries: [graph],
            rowEntries: [row],
            num: trustedNum,
            maxPayout: graph.trustedMaxPayout,
          });
          continue;
        }

        const trustedGroup = graph.trustedNum !== null
          ? graphNumGroups.get(trustedNum)
          : rowNumGroups.get(trustedNum);
        if ((trustedGroup?.length || 0) !== 1) continue;
        if (addMatch(
          graph,
          row,
          "anchored-duplicate-max",
          trustedNum,
          graph.trustedMaxPayout,
        )) {
          anchoredProgress = true;
          break;
        }
      }
      if (anchoredProgress) break;
    }
  }

  // 反復途中の一時的な曖昧さは残さず、最後まで未解決だった枠だけに理由を付ける。
  const finalMatchByGraphIndex = matchByGraphIndex();
  for (const page of graphPages.values()) {
    if (hasAcceptedOrderInversion(page, finalMatchByGraphIndex)) continue;
    for (let graphPosition = 0; graphPosition < page.length; graphPosition += 1) {
      const graph = page[graphPosition];
      if (usedGraphIndices.has(graph.index) || graph.trustedMaxPayout === null) continue;
      let previousMatch = null;
      for (let index = graphPosition - 1; index >= 0; index -= 1) {
        previousMatch = finalMatchByGraphIndex.get(page[index].index) || null;
        if (previousMatch) break;
      }
      let nextMatch = null;
      for (let index = graphPosition + 1; index < page.length; index += 1) {
        nextMatch = finalMatchByGraphIndex.get(page[index].index) || null;
        if (nextMatch) break;
      }
      if (!previousMatch || !nextMatch) continue;
      const previousRow = matchedRowEntry(previousMatch);
      const nextRow = matchedRowEntry(nextMatch);
      if (previousRow.sourceIndex !== nextRow.sourceIndex
        || previousRow.rowIndex >= nextRow.rowIndex) continue;
      const candidates = rows.filter((row) => (
        !usedRowIndices.has(row.index)
        && row.sourceIndex === previousRow.sourceIndex
        && row.rowIndex > previousRow.rowIndex
        && row.rowIndex < nextRow.rowIndex
        && row.trustedMaxPayout === graph.trustedMaxPayout
      ));
      if (candidates.length > 1) {
        addReason({
          code: "anchored-max-ambiguous",
          graphEntries: [graph],
          rowEntries: candidates,
          maxPayout: graph.trustedMaxPayout,
        });
      }
    }
  }

  // 重複最高出玉は正常に存在し得る。台番号で解決できなかった枠だけを確認対象にする。
  for (const graph of graphs) {
    if (usedGraphIndices.has(graph.index) || graph.trustedMaxPayout === null) continue;
    const maxPayout = graph.trustedMaxPayout;
    const graphGroup = graphMaxGroups.get(maxPayout) || [];
    const rowGroup = rowMaxGroups.get(maxPayout) || [];
    if (rowGroup.length && (graphGroup.length > 1 || rowGroup.length > 1)) {
      addReason({
        code: "duplicate-max-payout-needs-number",
        graphEntries: graphGroup,
        rowEntries: rowGroup,
        maxPayout,
      });
    }
  }

  // 順序は自動割当には使わず、同一ページ・同一表資料内の逆転を警告するだけにする。
  const internalMatches = matches.map((match) => ({
    match,
    graph: graphs[match.graphIndex],
    row: rows[match.tableIndex],
  }));
  const byPage = new Map();
  for (const entry of internalMatches) {
    const pageEntries = byPage.get(entry.graph.pageIndex) || [];
    pageEntries.push(entry);
    byPage.set(entry.graph.pageIndex, pageEntries);
  }
  for (const pageEntries of byPage.values()) {
    pageEntries.sort((left, right) => compareGraphs(left.graph, right.graph));
    for (let index = 1; index < pageEntries.length; index += 1) {
      const previous = pageEntries[index - 1];
      const current = pageEntries[index];
      if (previous.row.sourceIndex !== current.row.sourceIndex) continue;
      if (current.row.rowIndex >= previous.row.rowIndex) continue;
      addReason({
        code: "order-inversion",
        graphEntries: [previous.graph, current.graph],
        rowEntries: [previous.row, current.row],
      });
    }
  }

  const unmatchedGraphEntries = graphs
    .filter((entry) => !usedGraphIndices.has(entry.index))
    .sort(compareGraphs);
  const unmatchedRowEntries = rows
    .filter((entry) => !usedRowIndices.has(entry.index))
    .sort(compareRows);
  for (const graph of unmatchedGraphEntries) {
    addReason({ code: "unmatched-graph", graphEntries: [graph], num: graph.rawNum });
  }
  for (const row of unmatchedRowEntries) {
    addReason({ code: "unmatched-table-row", rowEntries: [row], num: row.rawNum });
  }

  matches.sort((left, right) => compareValues(left.num, right.num)
    || left.panelId.localeCompare(right.panelId)
    || left.rowId.localeCompare(right.rowId));

  const matchTypeCounts = matches.reduce((counts, match) => {
    counts[match.matchType] = (counts[match.matchType] || 0) + 1;
    return counts;
  }, {});
  const sharedUniqueNumberCount = sharedNumbers.filter((num) => (
    graphNumGroups.get(num)?.length === 1 && rowNumGroups.get(num)?.length === 1
  )).length;
  const sharedUniqueMaxPayoutCount = sharedMaxPayouts.filter((maxPayout) => (
    graphMaxGroups.get(maxPayout)?.length === 1 && rowMaxGroups.get(maxPayout)?.length === 1
  )).length;

  return {
    matches,
    unmatchedGraphs: unmatchedGraphEntries.map((entry) => entry.item),
    unmatchedRows: unmatchedRowEntries.map((entry) => entry.item),
    reviewReasons,
    summary: {
      graphCount: graphs.length,
      tableRowCount: rows.length,
      matchedCount: matches.length,
      unmatchedGraphCount: unmatchedGraphEntries.length,
      unmatchedRowCount: unmatchedRowEntries.length,
      numAndMaxExactMatchCount: matchTypeCounts["num-and-max-exact"] || 0,
      numExactMatchCount: matchTypeCounts["num-exact"] || 0,
      uniqueMaxMatchCount: matchTypeCounts["unique-max-exact"] || 0,
      anchoredDuplicateMaxMatchCount: matchTypeCounts["anchored-duplicate-max"] || 0,
      uniqueGraphNumberCount: uniqueValueCount(graphNumGroups),
      uniqueTableNumberCount: uniqueValueCount(rowNumGroups),
      sharedUniqueNumberCount,
      uniqueGraphMaxPayoutCount: uniqueValueCount(graphMaxGroups),
      uniqueTableMaxPayoutCount: uniqueValueCount(rowMaxGroups),
      sharedUniqueMaxPayoutCount,
      duplicateGraphNumbers,
      duplicateTableNumbers,
      duplicateGraphMaxPayouts,
      duplicateTableMaxPayouts,
      reviewReasonCount: reviewReasons.length,
    },
  };
}
