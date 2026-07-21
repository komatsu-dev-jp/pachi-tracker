import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { createCanvas, loadImage } from "@napi-rs/canvas";

import { parseSiteSevenCsvText } from "../siteSevenDataInput.js";
import { parseSiteSevenTableImageData } from "../siteSevenImageOcr.js";

const imageFixturePath = fileURLToPath(
  new URL("./fixtures/site-seven-table-52.png", import.meta.url),
);
const truthFixturePath = fileURLToPath(
  new URL("./fixtures/site-seven-table-52.expected.csv", import.meta.url),
);

const expectedNumbers = [
  479, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490,
  499, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509,
  546, 547, 548, 549, 550, 551, 552, 553, 554, 555, 556, 557,
  558, 559, 560, 561, 562, 563, 564, 565, 566, 567, 568, 569,
  570, 571, 572, 573, 574,
];

async function loadImageData() {
  const image = await loadImage(imageFixturePath);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height);
}

function rowIdentity(row) {
  return {
    num: Number(row.num),
    normalSpins: Number(row.normalSpins),
    maxPayout: Number(row.maxPayout),
    totalStarts: Number(row.totalStarts),
  };
}

test("提供画像52台: 台番号と同じ行の数値をCSV正解値と一致させる", async () => {
  const truthCsv = await readFile(truthFixturePath, "utf8");
  const truth = parseSiteSevenCsvText(truthCsv, {
    fileName: "site-seven-table-52.expected.csv",
  });

  assert.equal(truth.rows.length, 52);
  assert.equal(truth.skipped.length, 0);
  assert.equal(truth.duplicates.length, 0);
  assert.deepEqual(truth.rows.map((row) => Number(row.num)), expectedNumbers);

  const result = parseSiteSevenTableImageData(await loadImageData(), {
    allowRawMachineNumbers: true,
    fileName: "site-seven-table-52.png",
  });

  assert.equal(result.rows.length, truth.rows.length);
  assert.equal(result.machineNumberAccuracy, 1);
  assert.deepEqual(result.rows.map((row) => Number(row.num)), expectedNumbers);

  result.rows.forEach((actual, index) => {
    const expected = truth.rows[index];
    assert.equal(actual.sourceLine, index + 1, `${expected.num}番台の画像行番号`);
    assert.deepEqual(
      rowIdentity(actual),
      rowIdentity(expected),
      `${expected.num}番台の通常中スタート・最高出玉・大当り回数`,
    );
    assert.equal(actual.numAccepted, true, `${expected.num}番台の台番号`);
    assert.equal(actual.normalSpinsAccepted, true, `${expected.num}番台の通常中スタート`);
    assert.equal(actual.maxPayoutAccepted, true, `${expected.num}番台の最高出玉`);
    assert.equal(actual.totalStartsAccepted, true, `${expected.num}番台の大当り回数`);
  });
});
