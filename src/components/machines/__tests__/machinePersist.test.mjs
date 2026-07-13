// 機種スペック編集 → カスタム機種保存（buildMachineOverride）の「矛盾なし」検査。
// 実行: node src/components/machines/__tests__/machinePersist.test.mjs
//
// 検査の狙い:
//  T1 無編集セーブは元データを変えない（fallback 既定値の捏造ゼロ）
//  T2 R数の往復（parse→行→build）が記録フローの抽出結果を保つ
//  T3 R数を編集すると roundDist にその通り反映され、比率合計=100
//  T4 同名カスタムが searchMachines 先頭でビルトインを上書きする（記録フローが拾うのは編集値）
//  T5 buildMachineOverride は machineDB（ビルトイン）を一切変更しない

import assert from "node:assert";
import { searchMachines, machineDB } from "../../../machineDB.js";
import {
  normalizeMachine,
  buildMachineOverride,
  sumRatio,
} from "../machineSpecModel.js";

// 記録フローと同一のラウンド抽出（Tabs.jsx getMachineRounds 相当）
const flowRounds = (dist) => {
  const m = (dist || "").match(/(\d+)R/g);
  return m ? [...new Set(m.map((x) => parseInt(x, 10)))].sort((a, b) => a - b) : null;
};

let passed = 0;
let failed = 0;
const out = {};
function check(name, fn) {
  try {
    fn();
    out[name] = "PASS";
    passed++;
  } catch (e) {
    out[name] = `FAIL: ${e.message}`;
    failed++;
  }
}

// ── T1: 無編集セーブは元データを変えない ──
check("T1_無編集セーブは元データ保全", () => {
  const src = structuredClone(machineDB[0]); // P大海物語5 MTE2
  const model = normalizeMachine(src); // 一切編集しない
  const ov = buildMachineOverride(src, model);

  // 読み取り専用スペックは完全保全（捏造・改変なし）
  assert.strictEqual(ov.synthProb, src.synthProb, "synthProb");
  assert.strictEqual(ov.spec1R, src.spec1R, "spec1R");
  assert.strictEqual(ov.specAvgTotalRounds, src.specAvgTotalRounds, "specAvgTotalRounds");
  assert.deepStrictEqual(ov.border, src.border, "border");
  assert.strictEqual(ov.avgPayoutPerHit, src.avgPayoutPerHit, "avgPayoutPerHit");
  // 振分も元と一致（roundDist は件数不一致のため生値フォールバックで保全）
  assert.strictEqual(ov.roundDist, src.roundDist, "roundDist");
  assert.strictEqual(ov.rushDist, src.rushDist, "rushDist");
  assert.deepStrictEqual(ov.hesoDist, src.hesoDist, "hesoDist");
  assert.strictEqual(ov.isCustom, true, "isCustom");
});

// ── T2: R数の往復が記録フロー抽出を保つ ──
check("T2_R数往復が記録フロー抽出を保つ", () => {
  const src = {
    name: "テスト機A",
    synthProb: 319.6,
    hesoDist: [{ payout: 600, rate: 40 }, { payout: 1500, rate: 60 }],
    roundDist: "4R:40%, 10R:60%",
  };
  const model = normalizeMachine(src);
  const ov = buildMachineOverride(src, model);
  assert.deepStrictEqual(
    flowRounds(ov.roundDist),
    flowRounds(src.roundDist),
    `往復不一致: ${ov.roundDist}`
  );
  assert.deepStrictEqual(flowRounds(ov.roundDist), [4, 10]);
  assert.strictEqual(sumRatio(model.heso), 100, "比率合計100");
});

// ── T3: R数編集が roundDist へ反映され、比率合計=100 ──
check("T3_R数編集がroundDistへ反映", () => {
  const src = {
    name: "テスト機B",
    synthProb: 319.6,
    hesoDist: [{ payout: 450, rate: 30 }, { payout: 1500, rate: 70 }],
    roundDist: "3R:30%, 10R:70%",
  };
  const model = normalizeMachine(src);
  // ユーザーが R数を 3R→2R、10R→9R に編集したと仮定
  const edited = {
    ...model,
    heso: [
      { ...model.heso[0], rounds: "2", ratio: "30" },
      { ...model.heso[1], rounds: "9", ratio: "70" },
    ],
  };
  const ov = buildMachineOverride(src, edited);
  assert.deepStrictEqual(flowRounds(ov.roundDist), [2, 9], `roundDist=${ov.roundDist}`);
  assert.strictEqual(sumRatio(edited.heso), 100, "比率合計100");
});

// ── T4: 同名カスタムが searchMachines 先頭でビルトインを上書き ──
check("T4_カスタムがビルトインを上書き", () => {
  const builtin = machineDB[0]; // P大海物語5 MTE2 (roundDist 10R)
  const src = structuredClone(builtin);
  const model = normalizeMachine(src);
  // ユーザーが初当たり振分を 3R/7R に編集
  const edited = {
    ...model,
    heso: [
      { ...model.heso[0], rounds: "3", ratio: "50" },
      { ...model.heso[1], rounds: "7", ratio: "50" },
    ],
  };
  const override = buildMachineOverride(src, edited);

  const results = searchMachines(builtin.name, [override]);
  assert.strictEqual(results[0].name, builtin.name, "先頭が同名");
  assert.strictEqual(results[0].isCustom, true, "先頭がカスタム");
  // 記録フローが拾うラウンドは編集値（ビルトインの[10]ではない）
  assert.deepStrictEqual(flowRounds(results[0].roundDist), [3, 7], `roundDist=${results[0].roundDist}`);
  assert.notDeepStrictEqual(flowRounds(results[0].roundDist), flowRounds(builtin.roundDist));
});

// ── T5: buildMachineOverride は machineDB を変更しない ──
check("T5_machineDB不変", () => {
  const before = JSON.stringify(machineDB[0]);
  const model = normalizeMachine(machineDB[0]);
  const edited = {
    ...model,
    heso: model.heso.map((h, i) => ({ ...h, rounds: i === 0 ? "5" : "8" })),
    avgPayout: "9,999",
  };
  buildMachineOverride(machineDB[0], edited); // 入力（machineDB[0]）を破壊しないこと
  assert.strictEqual(JSON.stringify(machineDB[0]), before, "machineDB[0] が変更された");
});

// ── T6: 基本スペック編集がカスタム機種へ保存される ──
check("T6_基本スペック編集を保存", () => {
  const src = structuredClone(machineDB[0]);
  const model = normalizeMachine(src);
  const edited = {
    ...model,
    name: "P大海物語5 MTE2 修正版",
    maker: "三洋物産",
    type: "ハイミドル",
    synthProb: "318.1",
    border1K: "17.9",
    prize: "3",
    unitCost: "12.5",
    initialProb: "0.55",
    muraCoef: "50000",
    spatialSens: "1.2",
    regimeSens: "0.9",
    mcExpectedDaily: "1234",
    mcWinRate: "55.5",
  };
  const ov = buildMachineOverride(src, edited);
  assert.strictEqual(ov.name, "P大海物語5 MTE2 修正版", "name");
  assert.strictEqual(ov.maker, "三洋物産", "maker");
  assert.strictEqual(ov.synthProb, 318.1, "synthProb");
  assert.strictEqual(ov.prob, "1/318.1", "prob");
  assert.strictEqual(ov.border1K, 17.9, "border1K");
  assert.strictEqual(ov.border["4.00"], 17.9, "border.4.00");
  assert.strictEqual(ov.unitCost, 12.5, "unitCost");
  assert.strictEqual(ov.initialProb, 0.55, "initialProb");
  assert.strictEqual(ov.muraCoef, 50000, "muraCoef");
  assert.strictEqual(ov.spatialSens, 1.2, "spatialSens");
  assert.strictEqual(ov.regimeSens, 0.9, "regimeSens");
  assert.strictEqual(ov.mcExpectedDaily, 1234, "mcExpectedDaily");
  assert.strictEqual(ov.mcWinRate, 55.5, "mcWinRate");
});

// ── T7: 状態別振分は各表100%で、表示用のR数・行き先も保持する ──
check("T7_状態別振分を正規化", () => {
  const src = machineDB.find((m) => m.name === "e 東京リベンジャーズ 聖夜決戦編");
  const model = normalizeMachine(src);
  assert.strictEqual(model.hesoModes.length, 1, "ヘソモード数");
  assert.strictEqual(model.rushModes.length, 3, "RUSHモード数");
  for (const mode of [...model.hesoModes, ...model.rushModes]) {
    assert.strictEqual(sumRatio(mode.rows), 100, `${mode.name}の比率合計`);
  }
  assert.strictEqual(model.hesoModes[0].rows[0].rounds, "2", "初当りは2R");
  assert.strictEqual(model.rushModes[1].rows[0].roundsLabel, "10R×2", "CLIMAXは10R×2");
  assert.strictEqual(model.rushModes[1].rows[0].destination || model.rushModes[1].rows[0].label, "CLIMAX継続");
});

// ── T8: 状態別振分を無編集保存しても、可変R表記や他のRUSH状態を壊さない ──
check("T8_状態別振分の無編集保存を保全", () => {
  const src = structuredClone(machineDB.find((m) => m.name === "e ソードアート・オンライン アリシゼーション 夜空"));
  const model = normalizeMachine(src);
  const ov = buildMachineOverride(src, model);
  assert.strictEqual(ov.roundDist, src.roundDist, "roundDist");
  assert.strictEqual(ov.rushDist, src.rushDist, "rushDist");
  assert.deepStrictEqual(ov.hesoModes, src.hesoModes, "hesoModes");
  assert.deepStrictEqual(ov.rushModes, src.rushModes, "rushModes");
});

// ── T9: 今回の全対象機種は、状態別の各振分が100% ──
check("T9_対象8機種の全振分が100%", () => {
  const targets = [
    "PAスーパー海物語IN沖縄6 Withえなこ",
    "Pフィーバー機動戦士ガンダムSEED LT-Light ver.",
    "e 東京リベンジャーズ 聖夜決戦編",
    "e 無職転生 ～異世界行ったら本気だす～",
    "e結城友奈は勇者である～極限7500～",
    "e 東京喰種 超デカ超一撃ver.",
    "ぱちんこ 必殺仕事人Ⅵ",
    "e ソードアート・オンライン アリシゼーション 夜空",
  ];
  for (const name of targets) {
    const src = machineDB.find((m) => m.name === name);
    assert.ok(src, `${name}が未登録`);
    const model = normalizeMachine(src);
    for (const mode of [...model.hesoModes, ...model.rushModes]) {
      assert.strictEqual(sumRatio(mode.rows), 100, `${name} / ${mode.name}`);
    }
  }
});

// ── T10: 公開サイトで照合した主要振分を固定し、後の変更で架空値へ戻るのを防ぐ ──
check("T10_公開振分の主要値を固定", () => {
  const byName = (name) => machineDB.find((m) => m.name === name);
  const signature = (rows) => rows.map((r) => [r.roundsLabel || r.rounds, r.payoutLabel || r.payout, r.rate]);

  assert.deepStrictEqual(signature(byName("PAスーパー海物語IN沖縄6 Withえなこ").hesoModes[0].rows), [[10, 1000, 1], [6, 600, 50], [4, 400, 4], [4, 400, 45]]);
  assert.deepStrictEqual(signature(byName("Pフィーバー機動戦士ガンダムSEED LT-Light ver.").hesoModes[0].rows), [[10, 1500, 1], [2, 300, 99]]);
  assert.deepStrictEqual(signature(byName("e 東京リベンジャーズ 聖夜決戦編").hesoModes[0].rows), [[2, 300, 50], [2, 300, 50]]);
  assert.deepStrictEqual(signature(byName("e 無職転生 ～異世界行ったら本気だす～").rushModes[0].rows), [["10R×4", 6000, 23.5], ["10R×2", 3000, 26.5], [10, 1500, 50]]);
  const yuyuyu = byName("e結城友奈は勇者である～極限7500～");
  assert.strictEqual(yuyuyu.rushContinueRate, 70, "真・勇者RUSH継続率");
  assert.deepStrictEqual(signature(yuyuyu.rushModes[0].rows), [["BONUSジャッジ", "1500 or 7500個", 75], ["STリセット", 0, 25]]);
  assert.deepStrictEqual(signature(yuyuyu.rushModes[1].rows), [["10R×5", 7500, 25], [10, 1500, 75]]);
  const ghoul = byName("e 東京喰種 超デカ超一撃ver.");
  assert.strictEqual(normalizeMachine(ghoul).updatedAt, "2026-07-13", "公開情報の確認日");
  assert.deepStrictEqual(signature(ghoul.hesoModes[0].rows), [["10R×5", 7500, 50], ["10R×2", 3000, 50]]);
  assert.deepStrictEqual(signature(ghoul.hesoModes[1].rows), [["2R or 10R×5", "300 or 7500個", 100]]);
  assert.deepStrictEqual(signature(ghoul.rushModes[0].rows), [["10R×2", 3000, 50], ["10R×4以上", "6000個以上", 50]]);
  assert.deepStrictEqual(signature(ghoul.rushModes[1].rows), [["10R×6＋α", "9000個＋α", 12.5], ["10R×6", 9000, 12.5], ["10R×4", 6000, 25], ["10R×2", 3000, 50]]);
  assert.deepStrictEqual(signature(byName("ぱちんこ 必殺仕事人Ⅵ").hesoModes[0].rows), [[3, 450, 46], ["C時短", 0, 8], [3, 450, 46]]);
  assert.deepStrictEqual(signature(byName("e ソードアート・オンライン アリシゼーション 夜空").hesoModes[0].rows), [["10R×2～6＋α", "3000～9000個＋α", 1.5], [2, 300, 48.5], [2, 300, 50]]);
});

// ── T11: エヴァ15の古い仮振分へ戻らないことを固定 ──
check("T11_エヴァ15の公開振分を固定", () => {
  const eva15 = machineDB.find((m) => m.name === "エヴァンゲリオン15");
  const signature = (rows) => rows.map((r) => [r.roundsLabel || r.rounds, r.payoutLabel || r.payout, r.rate]);
  assert.strictEqual(eva15.synthProb, 319.7, "通常時確率");
  assert.strictEqual(eva15.border1K, 17.0, "等価ボーダー");
  assert.deepStrictEqual(signature(eva15.hesoModes[0].rows), [[10, 1500, 3], [3, 450, 56], [3, 450, 41]]);
  assert.deepStrictEqual(signature(eva15.rushModes[0].rows), [[10, 1500, 100]]);
  assert.deepStrictEqual(flowRounds(eva15.roundDist), [3, 10]);
});

console.log(JSON.stringify(out, null, 2));
console.log(`\n${passed} passed / ${failed} failed`);
if (failed > 0) process.exit(1);
