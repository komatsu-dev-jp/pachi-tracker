import test from "node:test";
import assert from "node:assert/strict";

import { matchSiteSevenGraphPanels } from "../siteSevenJointMatcher.js";

const MACHINE_NUMBERS = [
  479, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490,
  499, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509,
  546, 547, 548, 549, 550, 551, 552, 553, 554, 555, 556,
  557, 558, 559, 560, 561, 562, 563, 564, 565, 566, 567,
  568, 569, 570, 571, 572, 573, 574,
];

const MAX_PAYOUTS = [
  17370, 13330, 30100, 8600, 11710, 17330, 25120, 20, 10950, 2720,
  21490, 14970, 38140, 8750, 1380, 10830, 10, 15280, 14580, 5380,
  13200, 20, 13890, 11730, 2740, 49190, 15210, 4720, 5400, 6640,
  20, 5390, 27910, 5560, 2740, 1500, 18190, 38480, 26520, 25480,
  6880, 29920, 5420, 25820, 8310, 15110, 28290, 10830, 4150,
  29130, 2840, 57350,
];

function fixture({ graphNumbersAccepted = true } = {}) {
  const graphPanels = MACHINE_NUMBERS.map((num, index) => {
    const pageIndex = index < 20 ? 0 : index < 40 ? 1 : 2;
    const pageOffset = pageIndex === 0 ? index : pageIndex === 1 ? index - 20 : index - 40;
    return {
      panelId: `g-${num}`,
      observedNumCandidate: String(num),
      num: String(num),
      machineNumberAccepted: graphNumbersAccepted,
      maxPayout: MAX_PAYOUTS[index],
      maxPayoutAccepted: true,
      pageIndex,
      rowIndex: Math.floor(pageOffset / 2),
      colIndex: pageOffset % 2,
    };
  });
  const tableRows = MACHINE_NUMBERS.map((num, index) => ({
    rowId: `t-${num}`,
    num: String(num),
    numAccepted: true,
    maxPayout: MAX_PAYOUTS[index],
    maxPayoutAccepted: true,
    sourceIndex: 0,
    rowIndex: index,
  }));
  return { graphPanels, tableRows };
}

function mappingFingerprint(result) {
  return result.matches.map((match) => (
    `${match.panelId}:${match.rowId}:${match.num}:${match.maxPayout}:${match.matchType}`
  ));
}

function replaceGraph(graphPanels, num, update) {
  return graphPanels.map((panel) => (
    String(panel.num) === String(num) ? { ...panel, ...update } : panel
  ));
}

test("新基準4枚のsynthetic goldenは52台を台番号＋最高出玉で完全一致する", () => {
  const { graphPanels, tableRows } = fixture({ graphNumbersAccepted: false });
  const result = matchSiteSevenGraphPanels(graphPanels, tableRows);

  assert.equal(result.matches.length, 52);
  assert.deepEqual(result.matches.map((match) => Number(match.num)), MACHINE_NUMBERS);
  assert.deepEqual(result.matches.map((match) => match.maxPayout), MAX_PAYOUTS);
  assert.ok(result.matches.every((match) => (
    ["unique-max", "anchored-duplicate-max"].includes(match.matchedBy)
  )));
  assert.ok(result.matches.every((match) => (
    match.accepted === true
    && match.resolvedNum === match.num
    && Number.isInteger(match.graphIndex)
    && Number.isInteger(match.tableIndex)
  )));
  assert.deepEqual(result.unmatchedGraphs, []);
  assert.deepEqual(result.unmatchedRows, []);
  assert.deepEqual(result.reviewReasons, []);
  assert.equal(result.summary.numAndMaxExactMatchCount, 0);
  assert.equal(result.summary.uniqueMaxMatchCount, 45);
  assert.equal(result.summary.anchoredDuplicateMaxMatchCount, 7);
  assert.equal(result.summary.uniqueGraphNumberCount, 0);
  assert.equal(result.summary.uniqueTableNumberCount, 52);
  assert.equal(result.summary.sharedUniqueNumberCount, 0);
  assert.equal(result.summary.uniqueGraphMaxPayoutCount, 45);
  assert.equal(result.summary.uniqueTableMaxPayoutCount, 45);
  assert.equal(result.summary.sharedUniqueMaxPayoutCount, 45);
  assert.deepEqual(result.summary.duplicateGraphMaxPayouts, [20, 2740, 10830]);
  assert.deepEqual(result.summary.duplicateTableMaxPayouts, [20, 2740, 10830]);
});

test("入力配列やグラフ画像の選択順を変えても52台の対応は変わらない", () => {
  const { graphPanels, tableRows } = fixture({ graphNumbersAccepted: false });
  const baseline = matchSiteSevenGraphPanels(graphPanels, tableRows);
  const shuffledGraphs = [
    ...graphPanels.filter((panel) => panel.pageIndex === 2).reverse(),
    ...graphPanels.filter((panel) => panel.pageIndex === 0).reverse(),
    ...graphPanels.filter((panel) => panel.pageIndex === 1).reverse(),
  ].map((panel) => ({
    ...panel,
    pageIndex: ({ 0: 2, 1: 0, 2: 1 })[panel.pageIndex],
  }));
  const shuffledRows = tableRows.filter((_, index) => index % 2 === 1)
    .concat(tableRows.filter((_, index) => index % 2 === 0).reverse());
  const shuffled = matchSiteSevenGraphPanels(shuffledGraphs, shuffledRows);

  assert.deepEqual(mappingFingerprint(shuffled), mappingFingerprint(baseline));
  assert.equal(shuffled.summary.matchedCount, 52);
  assert.equal(shuffled.summary.reviewReasonCount, 0);
});

test("表の途中が1行欠落しても、その台だけ未対応となり後続はずれない", () => {
  const { graphPanels, tableRows } = fixture({ graphNumbersAccepted: false });
  const rowsWithout546 = tableRows.filter((row) => row.num !== "546");
  const result = matchSiteSevenGraphPanels(graphPanels, rowsWithout546);

  assert.equal(result.matches.length, 51);
  assert.deepEqual(result.unmatchedGraphs.map((panel) => panel.num), ["546"]);
  assert.deepEqual(result.unmatchedRows, []);
  for (const num of [547, 548, 563, 574]) {
    const match = result.matches.find((candidate) => candidate.num === String(num));
    assert.equal(match?.panelId, `g-${num}`);
    assert.equal(match?.rowId, `t-${num}`);
  }
});

test("表に余分な行が入っても、余分な1行だけを隔離して52台を維持する", () => {
  const { graphPanels, tableRows } = fixture({ graphNumbersAccepted: false });
  const extra = {
    rowId: "t-extra-545",
    num: "545",
    numAccepted: true,
    maxPayout: 12340,
    maxPayoutAccepted: true,
    sourceIndex: 0,
    rowIndex: 23.5,
  };
  const result = matchSiteSevenGraphPanels(graphPanels, [...tableRows, extra]);

  assert.equal(result.matches.length, 52);
  assert.deepEqual(result.unmatchedGraphs, []);
  assert.deepEqual(result.unmatchedRows.map((row) => row.rowId), ["t-extra-545"]);
  assert.ok(result.reviewReasons.some((reason) => (
    reason.code === "unmatched-table-row" && reason.rowIds.includes("t-extra-545")
  )));
});

test("グラフの途中が1枠欠落しても、その表行だけ未対応となり後続はずれない", () => {
  const { graphPanels, tableRows } = fixture({ graphNumbersAccepted: false });
  const graphsWithout546 = graphPanels.filter((panel) => panel.num !== "546");
  const result = matchSiteSevenGraphPanels(graphsWithout546, tableRows);

  assert.equal(result.matches.length, 51);
  assert.deepEqual(result.unmatchedGraphs, []);
  assert.deepEqual(result.unmatchedRows.map((row) => row.num), ["546"]);
  for (const num of [547, 548, 563, 574]) {
    const match = result.matches.find((candidate) => candidate.num === String(num));
    assert.equal(match?.panelId, `g-${num}`);
    assert.equal(match?.rowId, `t-${num}`);
  }
});

test("479を高信頼で475と誤読しても、一意な17370を根拠に上書きしない", () => {
  const { graphPanels, tableRows } = fixture();
  const corrupted = replaceGraph(graphPanels, 479, {
    observedNumCandidate: "475",
    num: "475",
    machineNumberAccepted: true,
  });
  const result = matchSiteSevenGraphPanels(corrupted, tableRows);

  assert.equal(result.matches.length, 51);
  assert.deepEqual(result.unmatchedGraphs.map((panel) => panel.panelId), ["g-479"]);
  assert.deepEqual(result.unmatchedRows.map((row) => row.rowId), ["t-479"]);
  const conflict = result.reviewReasons.find((reason) => reason.code === "number-conflict");
  assert.deepEqual(conflict?.graphIds, ["g-479"]);
  assert.deepEqual(conflict?.rowIds, ["t-479"]);
  assert.equal(conflict?.maxPayout, 17370);
});

test("台番号が欠損した場合だけ、一意な最高出玉6880で563へ安全に補助する", () => {
  const { graphPanels, tableRows } = fixture();
  const missingNumber = replaceGraph(graphPanels, 563, {
    observedNumCandidate: "",
    num: "",
    machineNumberAccepted: false,
  });
  const result = matchSiteSevenGraphPanels(missingNumber, tableRows);
  const match = result.matches.find((candidate) => candidate.panelId === "g-563");

  assert.equal(result.matches.length, 52);
  assert.equal(match?.rowId, "t-563");
  assert.equal(match?.num, "563");
  assert.equal(match?.maxPayout, 6880);
  assert.equal(match?.matchType, "unique-max-exact");
  assert.equal(result.summary.uniqueMaxMatchCount, 1);
});

for (const [num, duplicateMax] of [[486, 20], [547, 2740], [502, 10830]]) {
  test(`重複最高出玉${duplicateMax}も台${num}の前後2側anchorで一意に確定する`, () => {
    const { graphPanels, tableRows } = fixture();
    const missingNumber = replaceGraph(graphPanels, num, {
      observedNumCandidate: "",
      num: "",
      machineNumberAccepted: false,
    });
    const result = matchSiteSevenGraphPanels(missingNumber, tableRows);

    assert.equal(result.matches.length, 52);
    const match = result.matches.find((candidate) => candidate.panelId === `g-${num}`);
    assert.equal(match?.rowId, `t-${num}`);
    assert.equal(match?.resolvedNum, String(num));
    assert.equal(match?.maxPayout, duplicateMax);
    assert.equal(match?.matchedBy, "anchored-duplicate-max");
    assert.equal(match?.accepted, true);
  });
}

test("重複最高出玉は片側anchorしかないページ先頭では確定しない", () => {
  const graphPanels = [
    { panelId: "g-486", observedNumCandidate: "486", machineNumberAccepted: false, maxPayout: 20, maxPayoutAccepted: true, pageIndex: 0, rowIndex: 0, colIndex: 0 },
    { panelId: "g-487", num: 487, machineNumberAccepted: true, maxPayout: 10950, maxPayoutAccepted: true, pageIndex: 0, rowIndex: 0, colIndex: 1 },
    { panelId: "g-508", num: 508, machineNumberAccepted: true, maxPayout: 20, maxPayoutAccepted: true, pageIndex: 1, rowIndex: 0, colIndex: 0 },
  ];
  const tableRows = [
    { rowId: "t-486", num: 486, numAccepted: true, maxPayout: 20, maxPayoutAccepted: true, sourceIndex: 0, rowIndex: 0 },
    { rowId: "t-487", num: 487, numAccepted: true, maxPayout: 10950, maxPayoutAccepted: true, sourceIndex: 0, rowIndex: 1 },
    { rowId: "t-508", num: 508, numAccepted: true, maxPayout: 20, maxPayoutAccepted: true, sourceIndex: 0, rowIndex: 2 },
  ];
  const result = matchSiteSevenGraphPanels(graphPanels, tableRows);

  assert.equal(result.matches.length, 2);
  assert.deepEqual(result.unmatchedGraphs.map((panel) => panel.panelId), ["g-486"]);
  assert.deepEqual(result.unmatchedRows.map((row) => row.rowId), ["t-486"]);
  assert.equal(result.summary.anchoredDuplicateMaxMatchCount, 0);
});

test("前後anchor区間に同じ最高出玉が2行あれば確定しない", () => {
  const graphPanels = [
    { panelId: "g-100", num: 100, machineNumberAccepted: true, maxPayout: 1000, maxPayoutAccepted: true, pageIndex: 0, rowIndex: 0, colIndex: 0 },
    { panelId: "g-unknown", observedNumCandidate: "", machineNumberAccepted: false, maxPayout: 20, maxPayoutAccepted: true, pageIndex: 0, rowIndex: 0, colIndex: 1 },
    { panelId: "g-103", num: 103, machineNumberAccepted: true, maxPayout: 3000, maxPayoutAccepted: true, pageIndex: 0, rowIndex: 1, colIndex: 0 },
  ];
  const tableRows = [
    { rowId: "t-100", num: 100, numAccepted: true, maxPayout: 1000, maxPayoutAccepted: true, sourceIndex: 0, rowIndex: 0 },
    { rowId: "t-101", num: 101, numAccepted: true, maxPayout: 20, maxPayoutAccepted: true, sourceIndex: 0, rowIndex: 1 },
    { rowId: "t-102", num: 102, numAccepted: true, maxPayout: 20, maxPayoutAccepted: true, sourceIndex: 0, rowIndex: 2 },
    { rowId: "t-103", num: 103, numAccepted: true, maxPayout: 3000, maxPayoutAccepted: true, sourceIndex: 0, rowIndex: 3 },
  ];
  const result = matchSiteSevenGraphPanels(graphPanels, tableRows);

  assert.equal(result.matches.length, 2);
  assert.deepEqual(result.unmatchedGraphs.map((panel) => panel.panelId), ["g-unknown"]);
  assert.deepEqual(result.unmatchedRows.map((row) => row.rowId), ["t-101", "t-102"]);
  assert.ok(result.reviewReasons.some((reason) => (
    reason.code === "anchored-max-ambiguous" && reason.maxPayout === 20
  )));
});

test("前後anchorが表で逆順なら重複最高出玉を確定しない", () => {
  const graphPanels = [
    { panelId: "g-100", num: 100, machineNumberAccepted: true, maxPayout: 1000, maxPayoutAccepted: true, pageIndex: 0, rowIndex: 0, colIndex: 0 },
    { panelId: "g-unknown", observedNumCandidate: "101", machineNumberAccepted: false, maxPayout: 20, maxPayoutAccepted: true, pageIndex: 0, rowIndex: 0, colIndex: 1 },
    { panelId: "g-103", num: 103, machineNumberAccepted: true, maxPayout: 3000, maxPayoutAccepted: true, pageIndex: 0, rowIndex: 1, colIndex: 0 },
    { panelId: "g-duplicate-20", num: 200, machineNumberAccepted: true, maxPayout: 20, maxPayoutAccepted: true, pageIndex: 1, rowIndex: 0, colIndex: 0 },
  ];
  const tableRows = [
    { rowId: "t-103", num: 103, numAccepted: true, maxPayout: 3000, maxPayoutAccepted: true, sourceIndex: 0, rowIndex: 0 },
    { rowId: "t-101", num: 101, numAccepted: true, maxPayout: 20, maxPayoutAccepted: true, sourceIndex: 0, rowIndex: 1 },
    { rowId: "t-100", num: 100, numAccepted: true, maxPayout: 1000, maxPayoutAccepted: true, sourceIndex: 0, rowIndex: 2 },
    { rowId: "t-200", num: 200, numAccepted: true, maxPayout: 20, maxPayoutAccepted: true, sourceIndex: 1, rowIndex: 0 },
  ];
  const result = matchSiteSevenGraphPanels(graphPanels, tableRows);

  assert.equal(result.matches.length, 3);
  assert.deepEqual(result.unmatchedGraphs.map((panel) => panel.panelId), ["g-unknown"]);
  assert.deepEqual(result.unmatchedRows.map((row) => row.rowId), ["t-101"]);
  assert.ok(result.reviewReasons.some((reason) => reason.code === "order-inversion"));
  assert.equal(result.summary.anchoredDuplicateMaxMatchCount, 0);
});

test("最高出玉17370と17330を近似一致させず、同じ台番号でも確認待ちにする", () => {
  const graphPanels = [{
    panelId: "g-479",
    observedNumCandidate: "479",
    machineNumberAccepted: true,
    maxPayout: "17,370玉",
    maxPayoutAccepted: true,
    pageIndex: 0,
    rowIndex: 0,
    colIndex: 0,
  }];
  const tableRows = [{
    rowId: "t-479",
    num: 479,
    numAccepted: true,
    maxPayout: 17330,
    maxPayoutAccepted: true,
    sourceIndex: 0,
    rowIndex: 0,
  }];
  const result = matchSiteSevenGraphPanels(graphPanels, tableRows);

  assert.equal(result.matches.length, 0);
  assert.equal(result.unmatchedGraphs.length, 1);
  assert.equal(result.unmatchedRows.length, 1);
  assert.ok(result.reviewReasons.some((reason) => (
    reason.code === "max-payout-conflict"
    && reason.num === "479"
  )));
});

test("台番号のhard conflictがある枠を別行の一意な最高出玉で迂回確定しない", () => {
  const graphPanels = [{
    panelId: "g-486",
    num: 486,
    machineNumberAccepted: true,
    maxPayout: 20,
    maxPayoutAccepted: true,
    pageIndex: 0,
    rowIndex: 0,
    colIndex: 0,
  }];
  const tableRows = [
    {
      rowId: "t-486-conflict",
      num: 486,
      numAccepted: true,
      maxPayout: 30,
      maxPayoutAccepted: true,
      sourceIndex: 0,
      rowIndex: 0,
    },
    {
      rowId: "t-unknown-max20",
      num: "",
      numAccepted: false,
      maxPayout: 20,
      maxPayoutAccepted: true,
      sourceIndex: 0,
      rowIndex: 1,
    },
  ];

  const result = matchSiteSevenGraphPanels(graphPanels, tableRows);

  assert.equal(result.matches.length, 0);
  assert.deepEqual(result.unmatchedGraphs.map((panel) => panel.panelId), ["g-486"]);
  assert.deepEqual(
    result.unmatchedRows.map((row) => row.rowId),
    ["t-486-conflict", "t-unknown-max20"],
  );
  assert.ok(result.reviewReasons.some((reason) => reason.code === "max-payout-conflict"));
  assert.equal(result.summary.uniqueMaxMatchCount, 0);
});

test("同じ台番号が表で重複した場合、最高出玉が同じでも1対1確定しない", () => {
  const { graphPanels, tableRows } = fixture();
  const duplicate = { ...tableRows[0], rowId: "t-479-copy", rowIndex: 0.5 };
  const result = matchSiteSevenGraphPanels(graphPanels, [...tableRows, duplicate]);

  assert.equal(result.matches.length, 51);
  assert.deepEqual(result.unmatchedGraphs.map((panel) => panel.panelId), ["g-479"]);
  assert.deepEqual(result.unmatchedRows.map((row) => row.rowId), ["t-479", "t-479-copy"]);
  assert.deepEqual(result.summary.duplicateTableNumbers, ["479"]);
  assert.ok(result.reviewReasons.some((reason) => reason.code === "duplicate-table-number"));
});

test("順序は補助警告に留め、完全一致した固定点を別台へ付け替えない", () => {
  const graphPanels = [
    { panelId: "g-479", num: 479, machineNumberAccepted: true, maxPayout: 17370, maxPayoutAccepted: true, pageIndex: 0, rowIndex: 0, colIndex: 0 },
    { panelId: "g-480", num: 480, machineNumberAccepted: true, maxPayout: 13330, maxPayoutAccepted: true, pageIndex: 0, rowIndex: 0, colIndex: 1 },
  ];
  const tableRows = [
    { rowId: "t-479", num: 479, numAccepted: true, maxPayout: 17370, maxPayoutAccepted: true, sourceIndex: 0, rowIndex: 1 },
    { rowId: "t-480", num: 480, numAccepted: true, maxPayout: 13330, maxPayoutAccepted: true, sourceIndex: 0, rowIndex: 0 },
  ];
  const result = matchSiteSevenGraphPanels(graphPanels, tableRows);

  assert.deepEqual(mappingFingerprint(result), [
    "g-479:t-479:479:17370:num-and-max-exact",
    "g-480:t-480:480:13330:num-and-max-exact",
  ]);
  assert.ok(result.reviewReasons.some((reason) => reason.code === "order-inversion"));
});
