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
import { matchSiteSevenGraphPanels } from "../siteSevenJointMatcher.js";
import { buildSiteSevenStructuredRows } from "../siteSevenStructuredRows.js";
import { parseSiteSevenCsvText } from "../siteSevenDataInput.js";

const GRAPH_ROOT = path.resolve(
  "src/components/delta/__tests__/fixtures/p-analysis-review-52",
);
const PAGES = [
  { file: "02.jpg", offset: 0, count: 20 },
  { file: "03.jpg", offset: 20, count: 20 },
  { file: "04.jpg", offset: 40, count: 12 },
];

// 正式基準の写真表と同じ52行。テキストPDFから6列を厳密抽出した状態を表す。
const PDF_ROWS = [
  [479,1912,1104,3,17370,14],[480,1859,1319,3,13330,12],
  [481,2665,1088,9,30100,33],[482,1570,805,5,8600,12],
  [483,2171,1478,4,11710,12],[484,2814,1652,7,17330,24],
  [485,3750,1767,12,25120,37],[486,467,467,0,20,0],
  [487,2835,1769,5,10950,18],[488,1191,956,1,2720,2],
  [489,2906,1167,11,21490,25],[490,2556,1335,5,14970,22],
  [499,2562,1173,8,38140,37],[500,2307,1494,6,8750,14],
  [501,598,498,1,1380,1],[502,2671,1537,8,10830,19],
  [503,192,192,0,10,0],[504,2550,1831,3,15280,13],
  [505,1166,582,3,14580,11],[506,2409,1870,3,5380,8],
  [507,2564,1650,5,13200,19],[508,230,230,0,20,0],
  [509,1739,917,4,13890,15],[546,3219,2030,5,11730,20],
  [547,1569,1268,2,2740,4],[548,2074,631,4,49190,40],
  [549,1299,751,3,15210,12],[550,1792,1116,4,4720,8],
  [551,2541,1764,5,5400,12],[552,1029,707,1,6640,5],
  [553,1260,1260,0,20,0],[554,1477,1127,2,5390,5],
  [555,2358,1111,5,27910,26],[556,2777,1747,8,5560,14],
  [557,1456,1117,3,2740,4],[558,1580,1280,3,1500,3],
  [559,2378,1327,5,18190,19],[560,5119,2627,8,38480,44],
  [561,3229,1643,7,26520,30],[562,3238,1681,9,25480,30],
  [563,934,629,2,6880,6],[564,3158,1687,7,29920,30],
  [565,1258,1010,1,5420,4],[566,3319,1724,5,25820,31],
  [567,3081,2059,7,8310,20],[568,1255,718,2,15110,12],
  [569,3683,1912,11,28290,36],[570,1563,936,4,10830,13],
  [571,1870,1247,6,4150,8],[572,3721,1816,10,29130,37],
  [573,1290,979,3,2840,5],[574,3932,1816,7,57350,49],
].map(([num, cumulativeStarts, normalSpins, firstHitCount, maxPayout, totalStarts]) => ({
  num,
  cumulativeStarts,
  normalSpins,
  firstHitCount,
  maxPayout,
  totalStarts,
}));

async function readImageData(file) {
  const image = await loadImage(file);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height);
}

let graphPanelsPromise = null;
async function formalGraphPanels() {
  if (!graphPanelsPromise) {
    graphPanelsPromise = (async () => {
      const ocrPages = [];
      for (let imageIndex = 0; imageIndex < PAGES.length; imageIndex += 1) {
        const page = PAGES[imageIndex];
        const image = await readImageData(path.join(GRAPH_ROOT, page.file));
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
        ocrPages.push({
          ...withNumbers,
          slots: withNumbers.slots.map((slot, panelIndex) => ({
            ...slot,
            source: {
              imageIndex,
              imageName: page.file,
              panelIndex,
              row: slot.row,
              column: slot.column,
            },
          })),
        });
      }
      return combineMachineNumberPages(ocrPages).slots.map((slot, graphIndex) => ({
        ...slot,
        panelId: `${slot.source.imageName}:${slot.source.panelIndex}`,
        observedNumCandidate: slot.machineNumberCandidate ?? slot.machineNumberOcr?.candidate ?? null,
        machineNumberAccepted: slot.machineNumberOcr?.accepted === true,
        pageIndex: slot.source.imageIndex,
        rowIndex: slot.source.row ?? slot.row ?? graphIndex,
        colIndex: slot.source.column ?? slot.column ?? 0,
      }));
    })();
  }
  return graphPanelsPromise;
}

function structuredPdfRows(rows = PDF_ROWS) {
  return buildSiteSevenStructuredRows({ rows }, {
    importKind: "pdf",
    sourceIndex: 0,
    sourceId: "site-seven-2026-02-13.pdf",
  });
}

test("正式グラフ52台fixtureと構造化PDF相当52行を100% relationできる", async () => {
  const graphPanels = await formalGraphPanels();
  const tableRows = structuredPdfRows();
  const result = matchSiteSevenGraphPanels(graphPanels, tableRows);

  assert.equal(graphPanels.length, 52);
  assert.equal(tableRows.length, 52);
  assert.ok(tableRows.every((row) => row.numAccepted && row.maxPayoutAccepted));
  assert.equal(result.summary.matchedCount, 52);
  assert.equal(result.summary.unmatchedGraphCount, 0);
  assert.equal(result.summary.unmatchedRowCount, 0);
  assert.deepEqual(result.reviewReasons, []);
  assert.deepEqual(
    result.matches.map((match) => Number(match.resolvedNum)),
    PDF_ROWS.map((row) => row.num),
  );
});

test("正式52台CSVも実パーサー経由でグラフと100% relationできる", async () => {
  const csv = [
    "台番,累計スタート,通常中スタート,初当り回数,最高出玉,大当り回数",
    ...PDF_ROWS.map((row) => [
      row.num,
      row.cumulativeStarts,
      row.normalSpins,
      row.firstHitCount,
      row.maxPayout,
      row.totalStarts,
    ].join(",")),
  ].join("\n");
  const parsed = parseSiteSevenCsvText(csv, { fileName: "site-seven-52.csv" });
  const structuredRows = buildSiteSevenStructuredRows(parsed, {
    importKind: "csv",
    sourceId: "site-seven-52.csv",
  });
  const result = matchSiteSevenGraphPanels(await formalGraphPanels(), structuredRows);

  assert.equal(parsed.rows.length, 52);
  assert.equal(result.summary.matchedCount, 52);
  assert.equal(result.summary.unmatchedGraphCount, 0);
  assert.equal(result.summary.unmatchedRowCount, 0);
  assert.deepEqual(result.reviewReasons, []);
});

test("構造化PDFの最高出玉がグラフと不一致なら同じ台番号でも確定しない", async () => {
  const graphPanels = await formalGraphPanels();
  const mismatched = PDF_ROWS.map((row) => (
    row.num === 479 ? { ...row, maxPayout: 17330 } : row
  ));
  const result = matchSiteSevenGraphPanels(graphPanels, structuredPdfRows(mismatched));

  assert.equal(result.summary.matchedCount, 51);
  assert.ok(!result.matches.some((match) => match.resolvedNum === "479"));
  assert.ok(result.reviewReasons.some((reason) => (
    reason.graphIds.includes("02.jpg:0")
    || reason.rowIds.includes("site-seven-2026-02-13.pdf:0:0")
  )));
});

test("構造化PDFに重複台番号があれば該当台をtrusted relationにしない", async () => {
  const graphPanels = await formalGraphPanels();
  const duplicate = { ...PDF_ROWS[0] };
  const tableRows = structuredPdfRows([...PDF_ROWS, duplicate]);
  const duplicated479 = tableRows.filter((row) => row.num === "479");
  const result = matchSiteSevenGraphPanels(graphPanels, tableRows);

  assert.equal(duplicated479.length, 2);
  assert.ok(duplicated479.every((row) => (
    row.numAccepted === false && row.maxPayoutAccepted === false
  )));
  assert.ok(!result.matches.some((match) => match.resolvedNum === "479"));
  assert.equal(result.summary.matchedCount, 51);
});
