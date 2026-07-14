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
    isCustom: true,
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
    isCustom: true,
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

// ── T12: 未検証機種を共通1500発で補完しない ──
check("T12_未検証振分の架空補完を禁止", () => {
  const unverified = machineDB.filter((m) => m.allocationVerified !== true);
  assert.ok(unverified.length > 0, "未検証機種の抽出");
  for (const machine of unverified) {
    const model = normalizeMachine(machine);
    assert.strictEqual(model.allocationUsable, false, `${machine.name}: 未検証フラグ`);
    assert.deepStrictEqual(model.heso, [], `${machine.name}: ヘソを架空補完しない`);
    assert.deepStrictEqual(model.rush, [], `${machine.name}: RUSHを架空補完しない`);
  }

  const verified = machineDB.filter((m) => m.allocationVerified === true);
  assert.ok(verified.length >= 9, "照合済み機種数");
  for (const machine of verified) {
    assert.ok(Array.isArray(machine.sourceUrls) && machine.sourceUrls.length > 0, `${machine.name}: 出典URL`);
    const model = normalizeMachine(machine);
    assert.strictEqual(model.allocationUsable, true, `${machine.name}: 表示可`);
    for (const mode of [...model.hesoModes, ...model.rushModes]) {
      assert.strictEqual(sumRatio(mode.rows), 100, `${machine.name} / ${mode.name}`);
    }
  }
});

// ── T13: 旧マスタで誤っていた5機種の公開振分を固定する ──
check("T13_旧マスタ5機種の公開振分を固定", () => {
  const byName = (name) => machineDB.find((m) => m.name === name);
  const signature = (rows) => rows.map((r) => [r.roundsLabel || r.rounds, r.payoutLabel || r.payout, r.rate]);

  const oumi5 = byName("P大海物語5 MTE2");
  assert.deepStrictEqual(signature(oumi5.hesoModes[0].rows), [[10, 1500, 60], [10, 1500, 40]]);
  assert.deepStrictEqual(signature(oumi5.rushModes[0].rows), [[10, 1500, 60], [10, 1500, 40]]);

  const hokuto10 = byName("e北斗の拳10");
  assert.strictEqual(hokuto10.synthProb, 348.6, "北斗10の通常時確率");
  assert.deepStrictEqual(signature(hokuto10.hesoModes[0].rows), [[10, 1500, 5], [2, 300, 70], [2, 300, 1], [2, 300, 4], [2, 300, 20]]);
  assert.deepStrictEqual(signature(hokuto10.rushModes[0].rows), [[10, 1500, 70], [3, 450, 30]]);

  const keiji3 = byName("P真・花の慶次3");
  assert.deepStrictEqual(signature(keiji3.hesoModes[0].rows), [[6, 900, 55], [6, 900, 45]]);
  assert.deepStrictEqual(signature(keiji3.rushModes[0].rows), [[10, 1500, 80], [2, 300, 20]]);

  const gen = byName("P大工の源さん超韋駄天");
  assert.deepStrictEqual(signature(gen.hesoModes[0].rows), [[6, 660, 60.2], [6, 660, 39.8]]);
  assert.deepStrictEqual(signature(gen.rushModes[0].rows), [[9, 990, 20], [3, 330, 80]]);

  const toaru = byName("Pとある魔術の禁書目録");
  assert.deepStrictEqual(signature(toaru.hesoModes[0].rows), [[4, 400, 100]]);
  assert.deepStrictEqual(signature(toaru.rushModes[0].rows), [[10, 1500, 70], [4, 400, 30]]);
});

// ── T14: 古い同名カスタムが新しい標準データを隠さない ──
check("T14_古い同名カスタムより更新版マスタを優先", () => {
  const master = machineDB.find((machine) => machine.name === "エヴァンゲリオン15");
  const stale = {
    ...structuredClone(master),
    id: 1,
    isCustom: true,
    dataUpdatedAt: "2026/06/02 18:42",
    border1K: 22,
    rushEntryRate: 60,
    rushContinueRate: 75,
    hesoModes: [{
      name: "特図1・ヘソ",
      rows: [
        { rounds: 10, payout: 1500, rate: 60 },
        { rounds: 10, payout: 1500, rate: 40 },
      ],
    }],
  };
  const hit = searchMachines("エヴァンゲリオン15", [stale])[0];
  assert.strictEqual(hit.dataUpdatedAt, "2026-07-13");
  assert.strictEqual(hit.border1K, 17);
  assert.strictEqual(hit.rushEntryRate, 70);
  assert.strictEqual(hit.hesoModes[0].rows[1].rounds, 3);
});

// ── T15: 50%上乗せループ機の状態別サマリーを固定 ──
check("T15_炎炎とリコリスの状態別振分を固定", () => {
  const signature = (rows) => rows.map((r) => [r.roundsLabel || r.rounds, r.payoutLabel || r.payout, r.rate]);

  const lycoris = machineDB.find((m) => m.name === "eリコリス・リコイル");
  assert.strictEqual(lycoris.allocationVerified, true);
  assert.deepStrictEqual(signature(lycoris.hesoModes[0].rows), [[10, 1500, 0.1], [4, 600, 44.9], [3, 310, 5], [4, 600, 30], [3, 310, 20]]);
  assert.deepStrictEqual(signature(lycoris.rushModes[1].rows), [["5R×8", 6000, 50], ["5R×4", 3000, 50]]);
  assert.deepStrictEqual(signature(lycoris.rushModes[2].rows), [["5R×4上乗せ", 3000, 50], ["上乗せなし", 0, 50]]);

  const enen = machineDB.find((m) => m.name === "eフィーバー炎炎ノ消防隊2 シンラver.");
  assert.strictEqual(enen.allocationVerified, true);
  assert.deepStrictEqual(signature(enen.hesoModes[0].rows), [["10R×2", 3000, 50], [2, 300, 1], [10, 1500, 49]]);
  assert.deepStrictEqual(signature(enen.rushModes[2].rows), [["10R×2", 3000, 50], [10, 1500, 50]]);
  assert.deepStrictEqual(signature(enen.rushModes[3].rows), [[10, 1500, 50], ["上乗せなし", 0, 50]]);

  for (const target of [lycoris, enen]) {
    const model = normalizeMachine(target);
    for (const mode of [...model.hesoModes, ...model.rushModes]) {
      assert.strictEqual(sumRatio(mode.rows), 100, `${target.name} / ${mode.name}`);
    }
  }
});

// ── T16: 直近1年の優先更新5機種の公開振分を固定 ──
check("T16_直近機種5台の状態別振分を固定", () => {
  const byName = (name) => machineDB.find((m) => m.name === name);
  const signature = (rows) => rows.map((r) => [r.roundsLabel || r.rounds, r.payoutLabel || r.payout, r.rate]);
  const targets = [
    "e東京喰種W",
    "Pスーパー海物語IN沖縄6 LTP",
    "e ULTRAMAN 4500超ライト",
    "e盾の勇者の成り上がりアルティメット199ver.",
    "e吉宗極乗3000ver.",
  ].map(byName);

  assert.deepStrictEqual(signature(targets[0].hesoModes[0].rows), [[10, 1500, 50], [2, 300, 1], [10, 1500, 49]]);
  assert.deepStrictEqual(signature(targets[0].rushModes[0].rows), [["10R×4", 6000, 3], ["10R×2", 3000, 97]]);
  assert.deepStrictEqual(signature(targets[1].rushModes[0].rows), [[10, 1500, 51], [10, 1500, 1], [2, 60, 8], [10, 1500, 40]]);
  assert.deepStrictEqual(signature(targets[2].rushModes[0].rows), [["10R×6", 9000, 1], ["10R×3", 4500, 99]]);
  assert.deepStrictEqual(signature(targets[3].hesoModes[0].rows), [["10R×2+α", "3000発+α", 0.1], ["6R+α", "1800発+α", 2], [2, 300, 49.9], [2, 300, 48]]);
  assert.deepStrictEqual(signature(targets[3].rushModes[0].rows), [["10R×3+α", "4500発+α", 10], ["10R×2", 3000, 90]]);
  assert.deepStrictEqual(signature(targets[4].rushModes[1].rows), [["5R×4追加", 3000, 25], ["追加なし", 0, 75]]);

  for (const target of targets) {
    assert.strictEqual(target.allocationVerified, true, `${target.name}: 照合済み`);
    assert.ok(target.sourceUrls.some((url) => url.includes("hisshobon.jp")), `${target.name}: 必勝本の出典`);
    const model = normalizeMachine(target);
    for (const mode of [...model.hesoModes, ...model.rushModes]) {
      assert.strictEqual(sumRatio(mode.rows), 100, `${target.name} / ${mode.name}`);
    }
  }
});

// ── T17: 2026年1月導入機種の状態別振分を固定 ──
check("T17_2026年1月機種5台の公開振分を固定", () => {
  const byName = (name) => machineDB.find((m) => m.name === name);
  const signature = (rows) => rows.map((r) => [r.roundsLabel || r.rounds, r.payoutLabel || r.payout, r.rate]);
  const baki = byName("e範馬刃牙 199ver.");
  const kagura = byName("P閃乱カグラ189大入りver.");
  const kanokari = byName("PF彼女、お借りします LT-Light ver.");
  const utawarerumono = byName("PFうたわれるもの LT-Light ver.");
  const youjitsu = byName("eようこそ実力至上主義の教室へ");

  assert.strictEqual(baki.synthProb, 199.8, "刃牙の通常時確率");
  assert.deepStrictEqual(signature(baki.rushModes[0].rows), [[10, 1500, 5], [10, 1500, 95]]);
  assert.deepStrictEqual(signature(baki.rushModes[2].rows), [[10, 1500, 43], [10, 1500, 57]]);
  assert.deepStrictEqual(signature(kagura.rushModes[0].rows), [["7R×4", 4200, 11], [7, 1050, 89]]);
  assert.deepStrictEqual(signature(kagura.rushModes[1].rows), [["7R×4", 4200, 50], [7, 1050, 50]]);
  assert.deepStrictEqual(signature(kanokari.hesoModes[0].rows), [[10, 1000, 6], [4, 400, 44], [4, 400, 50]]);
  assert.deepStrictEqual(signature(kanokari.rushModes[0].rows), [["合計20R / 26R / 32R", "2000～3200発", 12], ["合計14R", 1400, 38], ["合計8R", 800, 50]]);
  assert.deepStrictEqual(signature(utawarerumono.rushModes[1].rows), [["10R×2", 1400, 60], [10, 700, 40]]);
  assert.deepStrictEqual(signature(youjitsu.rushModes[0].rows), [["10R×2", 3000, 73], ["10R×2", 3000, 27]]);
  assert.deepStrictEqual(signature(youjitsu.rushModes[1].rows), [["10R×2", 3000, 87], ["10R×2", 3000, 13]]);

  for (const target of [baki, kagura, kanokari, utawarerumono, youjitsu]) {
    assert.strictEqual(target.allocationVerified, true, `${target.name}: 照合済み`);
    assert.ok(target.sourceUrls.every((url) => url.includes("hisshobon.jp")), `${target.name}: 必勝本の出典`);
    const model = normalizeMachine(target);
    for (const mode of [...model.hesoModes, ...model.rushModes]) {
      assert.strictEqual(sumRatio(mode.rows), 100, `${target.name} / ${mode.name}`);
    }
  }
});

// ── T18: 2026年1月の追加5機種と旧誤登録値を固定 ──
check("T18_清流・リンかけ・ゴジエヴァ・SAOの公開振分を固定", () => {
  const byName = (name) => machineDB.find((m) => m.name === name);
  const signature = (rows) => rows.map((r) => [r.roundsLabel || r.rounds, r.payoutLabel || r.payout, r.rate]);
  const seiryu = byName("PA清流物語4ウキウキ79ver.");
  const ring = byName("Pリングにかけろ1 129ver.");
  const gold = byName("eゴジラ対エヴァンゲリオン2 超デカゴールド");
  const silver = byName("Pゴジラ対エヴァンゲリオン2 超デカシルバー");
  const sao = byName("eソードアート・オンライン99Ver.");

  assert.deepStrictEqual(signature(seiryu.rushModes[0].rows), [["10R×2", 1400, 33], [10, 700, 33], [3, 210, 34]]);
  assert.deepStrictEqual(signature(ring.hesoModes[0].rows), [[10, 1200, 5], [6, 720, 45], [6, 720, 50]]);
  assert.deepStrictEqual(signature(ring.rushModes[1].rows), [["10R×2", 2400, 54.5], [10, 1200, 19.5], [4, 480, 5.5], ["STリセット", 0, 20.5]]);
  assert.deepStrictEqual(signature(gold.hesoModes[0].rows), [[10, 1500, 0.5], [2, 300, 29.5], [2, 300, 70]]);
  assert.deepStrictEqual(signature(gold.rushModes[0].rows), [["10R×2+α", "3000発+α", 5], ["10R×2", 3000, 25], [10, 1500, 70]]);

  assert.strictEqual(silver.synthProb, 174.9, "SILVERの図柄揃い確率");
  assert.strictEqual(silver.border1K, 34.4, "SILVERの等価ボーダー");
  assert.strictEqual(silver.rushEntryRate, 25, "SILVERのLT突入率");
  assert.strictEqual(silver.rushContinueRate, 90, "SILVERのLT継続率");
  assert.deepStrictEqual(signature(silver.rushModes[0].rows), [["4R×2+α", "800発+α", 25], [4, 400, 75]]);

  assert.deepStrictEqual(signature(sao.hesoModes[0].rows), [[10, 800, 1], [3, 240, 54], [3, 240, 45]]);
  assert.deepStrictEqual(signature(sao.rushModes[0].rows), [[10, 800, 1], [10, 800, 15.5], [10, 800, 48.5], [3, 240, 35]]);
  assert.deepStrictEqual(signature(sao.rushModes[1].rows), [[10, 800, 33], [10, 800, 32], [3, 240, 35]]);

  for (const target of [seiryu, ring, gold, silver, sao]) {
    assert.strictEqual(target.allocationVerified, true, `${target.name}: 照合済み`);
    assert.ok(target.sourceUrls.some((url) => url.includes("hisshobon.jp")), `${target.name}: 必勝本の出典`);
    const model = normalizeMachine(target);
    for (const mode of [...model.hesoModes, ...model.rushModes]) {
      assert.strictEqual(sumRatio(mode.rows), 100, `${target.name} / ${mode.name}`);
    }
  }
});

// ── T19: 2026年初夏の追加5機種と旧誤登録値を固定 ──
check("T19_北斗無双・BASTARD・牙狼・まどか・北斗11の公開振分を固定", () => {
  const byName = (name) => machineDB.find((m) => m.name === name);
  const signature = (rows) => rows.map((r) => [r.roundsLabel || r.rounds, r.payoutLabel || r.payout, r.rate]);
  const musou = byName("e真・北斗無双 第5章 夢幻闘双");
  const bastard = byName("eフィーバーBASTARD!! -暗黒の破壊神-");
  const garo = byName("e牙狼11〜冴島大河〜魔戒BURST Ver.");
  const madoka = byName("e魔法少女まどか☆マギカ3 時間遡行");
  const hokuto = byName("e北斗の拳11 暴凶星");

  assert.strictEqual(musou.synthProb, 159.8, "北斗無双5の大当り確率");
  assert.deepStrictEqual(signature(musou.rushModes[0].rows), [["10R×5", 7500, 0.2], ["10R×4", 6000, 2.9], ["10R×3", 4500, 14.7], ["10R×2", 3000, 36.6], [10, 1500, 45.6]]);

  assert.strictEqual(bastard.synthProb, 399.9, "BASTARDの表示確率");
  assert.strictEqual(bastard.figureProb, 349.9, "BASTARDの図柄揃い確率");
  assert.strictEqual(bastard.chargeProb, 2785, "BASTARDのラーズちゃーじ確率");
  assert.deepStrictEqual(signature(bastard.rushModes[1].rows), [["10R×3", 4500, 30], ["10R×2", 3000, 70]]);

  assert.strictEqual(garo.synthProb, 349.9, "牙狼11の大当り確率");
  assert.strictEqual(garo.rushEntryRate, 25, "牙狼11の魔戒BURST突入率");
  assert.deepStrictEqual(signature(garo.rushModes[0].rows), [[10, 1500, 64.6], [10, 1500, 35.4]]);

  assert.strictEqual(madoka.synthProb, 319.9, "まどか3の大当り確率");
  assert.deepStrictEqual(signature(madoka.hesoModes[0].rows), [[10, 1500, 1], [3, 450, 69], [3, 450, 30]]);
  assert.deepStrictEqual(signature(madoka.rushModes[1].rows), [["5R×4", 3000, 75], [5, 750, 25]]);

  assert.strictEqual(hokuto.synthProb, 399.8, "北斗11の大当り確率");
  assert.strictEqual(hokuto.rushEntryRate, 61, "北斗11のRUSH突入率");
  assert.deepStrictEqual(signature(hokuto.hesoModes[0].rows), [["10R×3", 4500, 5], ["2R+10R", 1800, 4], [10, 1500, 52], [10, 1500, 39]]);
  assert.deepStrictEqual(signature(hokuto.rushModes[0].rows), [["10R×4", 6000, 10], ["10R×3", 4500, 40], [10, 1500, 30], ["STリセット", 0, 20]]);

  for (const target of [musou, bastard, garo, madoka, hokuto]) {
    assert.strictEqual(target.allocationVerified, true, `${target.name}: 照合済み`);
    assert.ok(target.sourceUrls.some((url) => url.includes("hisshobon.jp")), `${target.name}: 必勝本の出典`);
    const model = normalizeMachine(target);
    for (const mode of [...model.hesoModes, ...model.rushModes]) {
      assert.strictEqual(sumRatio(mode.rows), 100, `${target.name} / ${mode.name}`);
    }
  }
});

// ── T20: 直近のデカヘソ・LT機4台を固定 ──
check("T20_慶次・電王・超電磁砲・北斗無双デカヘソの公開振分を固定", () => {
  const byName = (name) => machineDB.find((m) => m.name === name);
  const signature = (rows) => rows.map((r) => [r.roundsLabel || r.rounds, r.payoutLabel || r.payout, r.rate]);
  const keiji = byName("e花の慶次～黄金の一撃");
  const deno = byName("e仮面ライダー電王 デカヘソ239");
  const railgun = byName("eとある科学の超電磁砲 PHASE NEXT");
  const musouDs = byName("e真・北斗無双 第5章 ドデカSTART");

  assert.deepStrictEqual(signature(keiji.hesoModes[0].rows), [[10, 1500, 50.1], [10, 1500, 49.9]]);
  assert.deepStrictEqual(signature(keiji.rushModes[2].rows), [["10R×4", 6000, 49.5], [10, 1500, 50.5]]);
  assert.strictEqual(deno.border1K, 30.4, "電王デカヘソの等価ボーダー");
  assert.deepStrictEqual(signature(deno.rushModes[1].rows), [["10R×2", 3000, 80], ["STリセット", 0, 20]]);
  assert.strictEqual(railgun.synthProb, 169.7, "超電磁砲PHASE NEXTの通常時確率");
  assert.deepStrictEqual(signature(railgun.rushModes[0].rows), [["10R×4 or 10R×5+α", "6000or7500発+α", 9.3], ["10R×3", 4500, 20.6], ["10R×2", 3000, 23.1], [10, 1500, 47]]);
  assert.strictEqual(musouDs.border1K, 29.8, "北斗無双デカヘソの等価ボーダー");
  assert.deepStrictEqual(signature(musouDs.hesoModes[0].rows), [["10R×2", 3000, 0.1], [6, 600, 50], [6, 600, 49.9]]);

  for (const target of [keiji, deno, railgun, musouDs]) {
    assert.strictEqual(target.allocationVerified, true, `${target.name}: 照合済み`);
    assert.ok(target.sourceUrls.length >= 2, `${target.name}: 複数出典`);
    const model = normalizeMachine(target);
    for (const mode of [...model.hesoModes, ...model.rushModes]) {
      assert.strictEqual(sumRatio(mode.rows), 100, `${target.name} / ${mode.name}`);
    }
  }
});

// ── T21: 2025年8月～2026年5月のLT機5台を固定 ──
check("T21_キン肉マン・牙狼12・ライザ・86・リングの公開振分を固定", () => {
  const byName = (name) => machineDB.find((m) => m.name === name);
  const signature = (rows) => rows.map((r) => [r.roundsLabel || r.rounds, r.payoutLabel || r.payout, r.rate]);
  const kinnikuman = byName("eフィーバーキン肉マン");
  const garo = byName("e牙狼12黄金騎士極限 XX-MJ");
  const ryza = byName("eライザのアトリエ 常闇の女王と秘密の隠れ家 K3");
  const eightySix = byName("e86-エイティシックス- MAM2");
  const ring = byName("eリング 最恐領域 RHA");

  assert.strictEqual(kinnikuman.synthProb, 349.9, "キン肉マンのチャージ込み確率");
  assert.deepStrictEqual(signature(kinnikuman.rushModes[0].rows), [["10R×5", 7500, 0.6], ["10R×4", 6000, 5.6], ["10R×3", 4500, 20.2], ["10R×2", 3000, 36.5], [10, 1500, 33.1], ["STリセット", 0, 4]]);
  assert.strictEqual(garo.rushEntryRate, 25, "牙狼12のLT実質突入率");
  assert.deepStrictEqual(signature(garo.rushModes[1].rows), [["10R×5", 7500, 25], [10, 1500, 51], [10, 1500, 24]]);
  assert.strictEqual(ryza.synthProb, 239.7, "ライザの通常時確率");
  assert.deepStrictEqual(signature(ryza.hesoModes[0].rows), [["2R+10R", 1800, 26], ["2R+10R", 1800, 25], [2, 300, 49]]);
  assert.deepStrictEqual(signature(ryza.rushModes[3].rows), [["10R×3追加", 4500, 64], ["追加なし", 0, 36]]);
  assert.strictEqual(eightySix.synthProb, 239.1, "86の通常時確率");
  assert.deepStrictEqual(signature(eightySix.hesoModes[0].rows), [["10R×3", 4500, 0.5], [2, 300, 54.5], [2, 300, 45]]);
  assert.strictEqual(ring.rushEntryRate, 57, "リング最恐領域のLT突入率");
  assert.deepStrictEqual(signature(ring.rushModes[0].rows), [["10R×4", 6000, 50], ["10R×2", 3000, 50]]);
  assert.deepStrictEqual(signature(ring.rushModes[1].rows), [[10, 1500, 100]]);

  for (const target of [kinnikuman, garo, ryza, eightySix, ring]) {
    assert.strictEqual(target.allocationVerified, true, `${target.name}: 照合済み`);
    assert.ok(target.sourceUrls.length >= 2, `${target.name}: 複数出典`);
    const model = normalizeMachine(target);
    for (const mode of [...model.hesoModes, ...model.rushModes]) {
      assert.strictEqual(sumRatio(mode.rows), 100, `${target.name} / ${mode.name}`);
    }
  }
});

console.log(JSON.stringify(out, null, 2));
console.log(`\n${passed} passed / ${failed} failed`);
if (failed > 0) process.exit(1);
