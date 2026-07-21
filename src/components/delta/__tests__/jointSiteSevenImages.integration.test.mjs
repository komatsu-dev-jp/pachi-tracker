import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

import { runAnalysis } from "../deltaEngine.js";
import { attachGraphPanelMetadata } from "../graphPanelMetadataOcr.js";
import {
  attachMachineNumbersToSlots,
  combineMachineNumberPages,
} from "../machineNumberOcr.js";
import {
  inspectSiteSevenTableStructure,
  parseSiteSevenTableImageData,
} from "../siteSevenImageOcr.js";
import { matchSiteSevenGraphPanels } from "../siteSevenJointMatcher.js";
import { resolveMatchedSiteSevenRows } from "../siteSevenJointResolution.js";
import { attachClippedDeltaRanges } from "../deltaBounded.js";
import {
  mergeTaiData,
  updateDeltaReview,
  validateDeltaRows,
} from "../deltaSelectors.js";
import { prepareSiteSevenImportedRows } from "../siteSevenDataInput.js";

const FIXTURE_ROOT = path.resolve("src/components/delta/__tests__/fixtures");
const GRAPH_ROOT = path.join(FIXTURE_ROOT, "p-analysis-review-52");
const TABLE_FILE = path.join(FIXTURE_ROOT, "site-seven-table-52.png");

const numbers = [479,480,481,482,483,484,485,486,487,488,489,490,499,500,501,502,503,504,505,506,507,508,509,546,547,548,549,550,551,552,553,554,555,556,557,558,559,560,561,562,563,564,565,566,567,568,569,570,571,572,573,574];
const maxPayouts = [17370,13330,30100,8600,11710,17330,25120,20,10950,2720,21490,14970,38140,8750,1380,10830,10,15280,14580,5380,13200,20,13890,11730,2740,49190,15210,4720,5400,6640,20,5390,27910,5560,2740,1500,18190,38480,26520,25480,6880,29920,5420,25820,8310,15110,28290,10830,4150,29130,2840,57350];

const pages = [
  { file: "02.jpg", offset: 0, count: 20 },
  { file: "03.jpg", offset: 20, count: 20 },
  { file: "04.jpg", offset: 40, count: 12 },
];

async function imageData(file) {
  const image = await loadImage(file);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height);
}

let tableRowsPromise = null;
async function tableRows() {
  if (!tableRowsPromise) {
    tableRowsPromise = imageData(TABLE_FILE).then((image) => (
      parseSiteSevenTableImageData(image, { allowRawMachineNumbers: true }).rows
    ));
  }
  return tableRowsPromise;
}

async function graphPage(page, imageIndex) {
  const image = await imageData(path.join(GRAPH_ROOT, page.file));
  const analysis = runAnalysis(image.data, image.width, image.height);
  assert.equal(analysis.results.length, page.count, `${page.file}: グラフ枠数`);
  const withPayout = attachGraphPanelMetadata(
    image.data,
    image.width,
    image.height,
    analysis.results,
  );
  const withNumbers = attachMachineNumbersToSlots(
    image.data,
    image.width,
    image.height,
    withPayout,
  );
  return {
    ...withNumbers,
    slots: withNumbers.slots.map((slot, panelIndex) => ({
      ...slot,
      expectedNum: String(numbers[page.offset + panelIndex]),
      expectedMaxPayout: maxPayouts[page.offset + panelIndex],
      source: {
        imageIndex,
        imageName: page.file,
        panelIndex,
        row: slot.row,
        column: slot.column,
      },
    })),
  };
}

async function jointResult(pageOrder) {
  const ocrPages = [];
  for (let imageIndex = 0; imageIndex < pageOrder.length; imageIndex += 1) {
    ocrPages.push(await graphPage(pageOrder[imageIndex], imageIndex));
  }
  const combined = combineMachineNumberPages(ocrPages);
  const graphPanels = combined.slots.map((slot, graphIndex) => ({
    ...slot,
    panelId: `${slot.source.imageName}:${slot.source.panelIndex}`,
    observedNumCandidate: slot.machineNumberCandidate ?? slot.machineNumberOcr?.candidate ?? null,
    machineNumberAccepted: slot.machineNumberOcr?.accepted === true,
    pageIndex: slot.source.imageIndex,
    rowIndex: slot.source.row ?? slot.row ?? graphIndex,
    colIndex: slot.source.column ?? slot.column ?? 0,
  }));
  return {
    graphPanels,
    result: matchSiteSevenGraphPanels(graphPanels, await tableRows()),
  };
}

test("基準4枚を表1枚＋グラフ3枚へ自動分類できる", async () => {
  const table = await imageData(TABLE_FILE);
  assert.equal(inspectSiteSevenTableStructure(table).rows.length, 52);
  for (const page of pages) {
    const graph = await imageData(path.join(GRAPH_ROOT, page.file));
    assert.throws(
      () => inspectSiteSevenTableStructure(graph),
      /サイトセブン表|罫線|台番号/u,
      `${page.file}: グラフを表へ誤分類しない`,
    );
  }
});

test("基準4枚は52台すべて台番号・最高出玉・グラフを1対1対応する", async () => {
  const rows = await tableRows();
  assert.equal(rows.length, 52);
  assert.ok(rows.every((row) => row.numAccepted));
  assert.ok(rows.every((row) => row.maxPayoutAccepted));
  assert.deepEqual(rows.map((row) => Number(row.num)), numbers);
  assert.deepEqual(rows.map((row) => Number(row.maxPayout)), maxPayouts);

  const { graphPanels, result } = await jointResult(pages);
  assert.equal(graphPanels.length, 52);
  assert.ok(graphPanels.every((panel) => panel.maxPayoutAccepted));
  assert.deepEqual(graphPanels.map((panel) => panel.maxPayout), maxPayouts);
  assert.equal(result.summary.matchedCount, 52);
  assert.equal(result.summary.unmatchedGraphCount, 0);
  assert.equal(result.summary.unmatchedRowCount, 0);
  assert.deepEqual(result.reviewReasons, []);

  const numByGraphIndex = new Map(
    result.matches.map((match) => [match.graphIndex, match.resolvedNum]),
  );
  graphPanels.forEach((panel, graphIndex) => {
    assert.equal(numByGraphIndex.get(graphIndex), panel.expectedNum);
    assert.equal(panel.maxPayout, panel.expectedMaxPayout);
  });

  const reviewNumbers = graphPanels
    .map((panel, graphIndex) => ({ panel, num: numByGraphIndex.get(graphIndex) }))
    .filter(({ panel }) => panel.status === "review")
    .map(({ num }) => num);
  assert.deepEqual(reviewNumbers, ["499", "503", "508", "548", "574"]);
  assert.equal(graphPanels.filter((panel) => panel.status === "ok").length, 47);
});

test("共同照合→表統合→上限接触記録→保存検証まで後続台をずらさない", async () => {
  const table = await tableRows();
  const { graphPanels, result } = await jointResult(pages);
  const matchByGraphIndex = new Map(result.matches.map((match) => [match.graphIndex, match]));
  const assigned = graphPanels.map((panel, graphIndex) => {
    const match = matchByGraphIndex.get(graphIndex);
    return {
      ...panel,
      num: match.resolvedNum,
      jointMatch: {
        accepted: true,
        resolvedNum: match.resolvedNum,
        matchedBy: match.matchedBy,
        maxPayout: match.maxPayout,
      },
    };
  });
  const resolvedTable = resolveMatchedSiteSevenRows(table, result.matches);
  const prepared = prepareSiteSevenImportedRows(resolvedTable, { expectedNumbers: numbers });
  assert.equal(prepared.rows.length, 52);
  const merged = mergeTaiData(assigned, prepared.rows);
  assert.equal(merged.matched, 52);

  const withCensoring = attachClippedDeltaRanges(merged.rows);
  const validation = validateDeltaRows(withCensoring);
  assert.equal(validation.exactCount, 47);
  assert.equal(validation.boundedCount, 2);
  assert.deepEqual(validation.boundedIndices.map((index) => withCensoring[index].num), ["499", "548"]);
  assert.deepEqual(validation.unresolvedIndices.map((index) => withCensoring[index].num), ["503", "508", "574"]);

  const reviewed = withCensoring.map((row) => (
    ["503", "508", "574"].includes(row.num)
      ? updateDeltaReview(row, { value: row.val, confirmed: true, reviewedAt: "2026-07-21T00:00:00.000Z" })
      : row
  ));
  const readyToSave = validateDeltaRows(reviewed);
  assert.equal(readyToSave.valid, true);
  assert.equal(readyToSave.exactCount, 50);
  assert.equal(readyToSave.boundedCount, 2);
});

test("グラフ3枚の選択順を変えても台とグラフの対応は変わらない", async () => {
  const shuffled = [pages[2], pages[0], pages[1]];
  const { graphPanels, result } = await jointResult(shuffled);
  assert.equal(result.summary.matchedCount, 52);
  assert.deepEqual(result.reviewReasons, []);
  const numByGraphIndex = new Map(
    result.matches.map((match) => [match.graphIndex, match.resolvedNum]),
  );
  graphPanels.forEach((panel, graphIndex) => {
    assert.equal(numByGraphIndex.get(graphIndex), panel.expectedNum);
  });
});
