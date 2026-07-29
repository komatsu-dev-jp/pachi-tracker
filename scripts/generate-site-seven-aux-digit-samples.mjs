import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";

import { createSiteSevenDigitTemplateFixture } from "../src/components/delta/siteSevenImageOcr.js";

const fixtureUrl = new URL(
  "../src/components/delta/__tests__/fixtures/site-seven-table-52.png",
  import.meta.url,
);
const truthUrl = new URL(
  "../src/components/delta/__tests__/fixtures/site-seven-table-52.expected.csv",
  import.meta.url,
);
const outputUrl = new URL(
  "../src/components/delta/siteSevenAuxDigitSamples.js",
  import.meta.url,
);

const image = await loadImage(fileURLToPath(fixtureUrl));
const canvas = createCanvas(image.width, image.height);
const context = canvas.getContext("2d");
context.drawImage(image, 0, 0);

const lines = (await readFile(truthUrl, "utf8")).trim().split(/\r?\n/u);
const headers = lines.shift().split(",");
const groundTruthRows = lines.map((line) => Object.fromEntries(
  line.split(",").map((value, index) => [headers[index], Number(value)]),
)).map((row) => ({
  cumulativeStarts: row["累計スタート"],
  normalSpins: row["通常中スタート"],
  firstHitCount: row["初当り回数"],
  maxPayout: row["最高出玉"],
  totalStarts: row["大当り回数"],
}));

const samples = createSiteSevenDigitTemplateFixture(
  context.getImageData(0, 0, image.width, image.height),
  { groundTruthRows, samplesPerDigit: 999 },
);
const source = [
  "// サイトセブン実画像fixtureから生成した、表の補助数値列用の固定数字字体。",
  "// 実行時に学習・通信は行わず、この検証済み標本だけをローカル照合する。",
  `export const SITE_SEVEN_AUX_DIGIT_SAMPLES = ${JSON.stringify(samples)};`,
  "",
].join("\n");
await writeFile(outputUrl, source, "utf8");
console.log(fileURLToPath(outputUrl));
