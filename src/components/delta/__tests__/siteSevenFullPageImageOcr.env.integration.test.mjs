import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { createCanvas, loadImage } from "@napi-rs/canvas";

import {
  inspectSiteSevenTableStructure,
  parseSiteSevenTableImageData,
} from "../siteSevenImageOcr.js";

const fixturePath = process.env.SITE_SEVEN_FULL_PAGE_FIXTURE_PATH || "";
const truthCsvPath = process.env.SITE_SEVEN_FULL_PAGE_TRUTH_CSV_PATH || "";
const FIELD_NAMES = [
  "num",
  "cumulativeStarts",
  "normalSpins",
  "firstHitCount",
  "maxPayout",
  "totalStarts",
];

async function readTruthRows() {
  const text = await readFile(truthCsvPath, "utf8");
  const [headerLine, ...lines] = text.trim().split(/\r?\n/u);
  assert.deepEqual(
    headerLine.split(",").map((value) => value.trim()),
    FIELD_NAMES,
    "truth CSV must use the six documented numeric columns",
  );
  return lines.filter(Boolean).map((line, rowIndex) => {
    const values = line.split(",").map((value) => Number(value.trim()));
    assert.equal(values.length, FIELD_NAMES.length, `truth CSV row ${rowIndex + 2}`);
    assert.ok(values.every(Number.isSafeInteger), `truth CSV row ${rowIndex + 2}`);
    return Object.fromEntries(FIELD_NAMES.map((field, index) => [field, values[index]]));
  });
}

async function loadFixtureImageData({
  scale = 1,
  jpegQuality = null,
  offsetX = 0,
  offsetY = 0,
} = {}) {
  const source = await loadImage(fixturePath);
  const width = Math.max(1, Math.round(source.width * scale)) + offsetX;
  const height = Math.max(1, Math.round(source.height * scale)) + offsetY;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(
    source,
    offsetX,
    offsetY,
    Math.max(1, Math.round(source.width * scale)),
    Math.max(1, Math.round(source.height * scale)),
  );
  if (jpegQuality !== null) {
    const recompressed = await loadImage(canvas.toBuffer("image/jpeg", jpegQuality));
    context.clearRect(0, 0, width, height);
    context.drawImage(recompressed, 0, 0);
  }
  return context.getImageData(0, 0, width, height);
}

function assertNoIncorrectFieldWasAccepted(result, truthRows, label) {
  assert.equal(result.rows.length, truthRows.length, `${label}: row count`);
  result.rows.forEach((row, rowIndex) => {
    for (const field of FIELD_NAMES) {
      if (Number(row[field]) === truthRows[rowIndex][field]) continue;
      assert.equal(
        row.fieldAccepted[field],
        false,
        `${label}: row ${rowIndex + 1} incorrectly accepted ${field}`,
      );
      assert.equal(row.reviewRequired, true, `${label}: incorrect row must be held`);
    }
  });
}

test("environment full-page fixture excludes page controls, header, summary and footer", {
  skip: !fixturePath && "set SITE_SEVEN_FULL_PAGE_FIXTURE_PATH",
}, async () => {
  const structure = inspectSiteSevenTableStructure(await loadFixtureImageData());
  assert.equal(structure.rows.length, 48);
  assert.ok(structure.rows.every((row, index) => (
    index === 0 || row.lineIndex === structure.rows[index - 1].lineIndex + 1
  )));
});

test("environment full-page fixture reads every verified table number", {
  skip: (!fixturePath || !truthCsvPath)
    && "set SITE_SEVEN_FULL_PAGE_FIXTURE_PATH and SITE_SEVEN_FULL_PAGE_TRUTH_CSV_PATH",
}, async () => {
  const truthRows = await readTruthRows();
  const result = parseSiteSevenTableImageData(await loadFixtureImageData(), {
    expectedNumbers: truthRows.map((row) => row.num),
  });

  assert.equal(result.rows.length, truthRows.length);
  assert.equal(result.machineNumberAccuracy, 1);
  result.rows.forEach((row, rowIndex) => {
    for (const field of FIELD_NAMES) {
      assert.equal(Number(row[field]), truthRows[rowIndex][field], `row ${rowIndex + 1} ${field}`);
      assert.equal(row.fieldAccepted[field], true, `row ${rowIndex + 1} ${field} accepted`);
    }
    assert.equal(row.reviewRequired, false, `row ${rowIndex + 1}`);
  });
});

test("resized, recompressed and shifted full-page fixtures never auto-accept a wrong number", {
  skip: (!fixturePath || !truthCsvPath)
    && "set SITE_SEVEN_FULL_PAGE_FIXTURE_PATH and SITE_SEVEN_FULL_PAGE_TRUTH_CSV_PATH",
}, async () => {
  const truthRows = await readTruthRows();
  for (const variant of [
    { label: "90 percent", scale: 0.9 },
    { label: "75 percent", scale: 0.75 },
    { label: "JPEG recompression", jpegQuality: 72 },
    { label: "position shift", offsetX: 3, offsetY: 4 },
  ]) {
    const result = parseSiteSevenTableImageData(await loadFixtureImageData(variant), {
      expectedNumbers: truthRows.map((row) => row.num),
    });
    assertNoIncorrectFieldWasAccepted(result, truthRows, variant.label);
    assert.ok(
      result.rows.some((row) => Object.values(row.fieldAccepted).some(Boolean)),
      `${variant.label}: at least one independently recognized field remains usable`,
    );
  }
});
