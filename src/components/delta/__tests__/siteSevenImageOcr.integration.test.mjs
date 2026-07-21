import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  findSiteSevenMachineNumberOrderConflicts,
  inspectSiteSevenTableStructure,
  parseSiteSevenTableImageData,
} from "../siteSevenImageOcr.js";
import { mergeSiteSevenParsedResults } from "../siteSevenDataInput.js";

const fixturePath = process.env.SITE_SEVEN_FIXTURE_PATH
  || fileURLToPath(new URL("./fixtures/site-seven-table-52.png", import.meta.url));
const expectedNumbers = [479,480,481,482,483,484,485,486,487,488,489,490,499,500,501,502,503,504,505,506,507,508,509,546,547,548,549,550,551,552,553,554,555,556,557,558,559,560,561,562,563,564,565,566,567,568,569,570,571,572,573,574];
const expectedNormalSpins = [1104,1319,1088,805,1478,1652,1767,467,1769,956,1167,1335,1173,1494,498,1537,192,1831,582,1870,1650,230,917,2030,1268,631,751,1116,1764,707,1260,1127,1111,1747,1117,1280,1327,2627,1643,1681,629,1687,1010,1724,2059,718,1912,936,1247,1816,979,1816];
const expectedJackpots = [14,12,33,12,12,24,37,0,18,2,25,22,37,14,1,19,0,13,11,8,19,0,15,20,4,40,12,8,12,5,0,5,26,14,4,3,19,44,30,30,6,30,4,31,20,12,36,13,8,37,5,49];
const expectedMaxPayouts = [17370,13330,30100,8600,11710,17330,25120,20,10950,2720,21490,14970,38140,8750,1380,10830,10,15280,14580,5380,13200,20,13890,11730,2740,49190,15210,4720,5400,6640,20,5390,27910,5560,2740,1500,18190,38480,26520,25480,6880,29920,5420,25820,8310,15110,28290,10830,4150,29130,2840,57350];

async function loadFixture(scale = 1, jpegQuality = null) {
  const source = await loadImage(fixturePath);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.drawImage(source, 0, 0, width, height);
  if (jpegQuality !== null) {
    const recompressed = await loadImage(canvas.toBuffer("image/jpeg", jpegQuality));
    context.clearRect(0, 0, width, height);
    context.drawImage(recompressed, 0, 0, width, height);
  }
  return context.getImageData(0, 0, width, height);
}

function makeAverageLabelLookBlue(image) {
  const copy = {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data),
  };
  const structure = inspectSiteSevenTableStructure(copy);
  const lastMachineRow = structure.rows.at(-1);
  const verticalLines = structure.geometry.lines;
  const left = verticalLines[1].end + 1;
  const right = verticalLines[2].start - 1;
  const top = lastMachineRow.bottom.end + 1;
  const bottom = structure.geometry.tableBottom;

  // 元画像の平均ラベルにある濃い緑だけを、JPEG圧縮で青寄りになった状態へ寄せる。
  // 修正前はこの変形で平均行が53台目として検出される。
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const index = (y * copy.width + x) * 4;
      const r = copy.data[index];
      const g = copy.data[index + 1];
      const b = copy.data[index + 2];
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      if (g > r + 8 && g > b + 8 && luma < 205) {
        copy.data[index] = 20;
        copy.data[index + 1] = 90;
        copy.data[index + 2] = 170;
      }
    }
  }
  return copy;
}

function assertNoIncorrectRowPasses(result) {
  result.rows.forEach((row, index) => {
    const correct = String(row.num) === String(expectedNumbers[index])
      && String(row.normalSpins) === String(expectedNormalSpins[index])
      && String(row.totalStarts) === String(expectedJackpots[index]);
    if (!correct) assert.equal(row.reviewRequired, true, `誤読した${index + 1}行目が自動確定されました`);
    if (String(row.num) !== String(expectedNumbers[index])) {
      assert.equal(row.numAccepted, false, `台番号を誤読した${index + 1}行目が確定されました`);
    }
    if (Number(row.normalSpins) !== expectedNormalSpins[index]) {
      assert.equal(
        row.normalSpinsAccepted,
        false,
        `通常中スタートを誤読した${index + 1}行目が確定されました`,
      );
    }
    if (Number(row.maxPayout) !== expectedMaxPayouts[index]) {
      assert.equal(
        row.maxPayoutAccepted,
        false,
        `最高出玉を誤読した${index + 1}行目が自動照合可能になりました`,
      );
    }
    if (Number(row.totalStarts) !== expectedJackpots[index]) {
      assert.equal(
        row.totalStartsAccepted,
        false,
        `大当たり回数を誤読した${index + 1}行目が確定されました`,
      );
    }
  });
}

test("台番号の順序が逆転したら前後の両方を不一致として検出する", () => {
  assert.deepEqual(
    findSiteSevenMachineNumberOrderConflicts([480, 479, 481], [479, 480, 481]),
    [0, 1]
  );
  assert.deepEqual(
    findSiteSevenMachineNumberOrderConflicts([479, "", 481], [479, 480, 481]),
    []
  );
});

test("実画像52台: 台番号・通常回転・大当たり回数を全件一致させる", async () => {
  const result = parseSiteSevenTableImageData(await loadFixture(), { expectedNumbers });
  assert.equal(result.rows.length, 52);
  assert.equal(result.machineNumberAccuracy, 1);
  assert.deepEqual(result.rows.map((row) => Number(row.num)), expectedNumbers);
  assert.deepEqual(result.rows.map((row) => Number(row.normalSpins)), expectedNormalSpins);
  assert.deepEqual(result.rows.map((row) => Number(row.maxPayout)), expectedMaxPayouts);
  assert.deepEqual(result.rows.map((row) => Number(row.totalStarts)), expectedJackpots);
  assert.ok(result.rows.every((row) => row.normalSpinsAccepted));
  assert.equal(result.rows.filter((row) => row.reviewRequired).length, 0);
  assert.ok(result.rows.every((row) => row.maxPayoutAccepted));
  assert.ok(result.rows.every((row) => (
    row.fieldConfidence.maxPayout === row.maxPayoutConfidence
      && row.fieldAccepted.maxPayout === row.maxPayoutAccepted
      && row.fieldReviewRequired.maxPayout === !row.maxPayoutAccepted
  )));
});

test("表末尾の平均行が青い台番号に見えても53台目として数えない", async () => {
  const image = makeAverageLabelLookBlue(await loadFixture());
  const structure = inspectSiteSevenTableStructure(image);
  const result = parseSiteSevenTableImageData(image, { expectedNumbers });

  assert.equal(structure.rows.length, 52);
  assert.equal(result.rows.length, 52);
  assert.equal(result.rows.at(-1).num, "574");
  assert.equal(result.rows.at(-1).sourceLine, 52);
});

test("期待台番号なしのrawモードでも52台の台番号を安全に読む", async () => {
  const result = parseSiteSevenTableImageData(await loadFixture(), {
    allowRawMachineNumbers: true,
  });
  assert.equal(result.machineNumberMode, "raw");
  assert.equal(result.machineNumberAccuracy, 1);
  assert.deepEqual(result.rows.map((row) => Number(row.num)), expectedNumbers);
  assert.ok(result.rows.every((row) => row.numAccepted));
});

test("店舗側の期待番号が1台だけ誤っていても高信頼OCRを別台へ静かに上書きしない", async () => {
  const wrongStoreNumbers = [475, ...expectedNumbers.slice(1)];
  const result = parseSiteSevenTableImageData(await loadFixture(), {
    expectedNumbers: wrongStoreNumbers,
  });

  assert.notEqual(result.rows[0].num, "475");
  assert.equal(result.rows[0].numAccepted, false);
  assert.equal(result.rows[0].reviewRequired, true);
  assert.deepEqual(
    result.rows.slice(1).map((row) => Number(row.num)),
    expectedNumbers.slice(1),
  );
  assert.ok(result.rows.slice(1).every((row) => row.numAccepted));
});

test("縮小・拡大・再圧縮画像: 誤読した各項目を未確認のまま通さない", async () => {
  for (const { image, label, expectPartialAcceptance } of [
    { image: await loadFixture(0.75), label: "0.75倍", expectPartialAcceptance: false },
    { image: await loadFixture(1, 60), label: "JPEG再圧縮", expectPartialAcceptance: false },
    { image: await loadFixture(1.25), label: "1.25倍", expectPartialAcceptance: true },
    { image: await loadFixture(2), label: "2倍", expectPartialAcceptance: true },
  ]) {
    const result = parseSiteSevenTableImageData(image, { expectedNumbers });
    assert.equal(result.rows.length, 52);
    assert.deepEqual(
      result.rows.map((row) => Number(row.machineNumberSuggested)),
      expectedNumbers,
      "店舗・島の固定行順は主入力と分離した候補として52台保持します",
    );
    result.rows.forEach((row, index) => {
      if (row.num) {
        assert.equal(Number(row.num), expectedNumbers[index], `${index + 1}行目に誤った台番号を表示しません`);
      } else {
        assert.equal(row.numAccepted, false);
        assert.equal(row.reviewRequired, true);
      }
    });
    assertNoIncorrectRowPasses(result);
    if (expectPartialAcceptance) {
      assert.ok(result.rows.some((row) => row.normalSpinsAccepted), `${label}: 正しい通常回転まで全行確認にしません`);
      assert.ok(result.rows.some((row) => row.totalStartsAccepted), `${label}: 正しい大当たり回数まで全行確認にしません`);
    }
  }
});

test("読めない台番号の候補行と欠落欄を二重生成しない", async () => {
  const parsed = parseSiteSevenTableImageData(await loadFixture(0.75), { expectedNumbers });
  const merged = mergeSiteSevenParsedResults([{ result: parsed, kind: "image" }], {
    expectedNumbers,
  });

  assert.equal(merged.rows.length, 52);
  assert.equal(merged.missingNumbers.length, 0);
  assert.deepEqual(
    merged.rows.map((row) => Number(row.machineNumberSuggested)),
    expectedNumbers,
  );
  assert.ok(merged.rows.every((row) => row.reviewRequired && !row.reviewConfirmed));
});
