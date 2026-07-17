// 機種スペック画面（MachineSpecWorkspace）の純ロジック。
// React / CSS に依存しないため、node から直接 import してテストできる。
// 表示モデル（normalizeMachine）と、保存用カスタム機種レコード生成（buildMachineOverride）を提供する。

export const fallbackMachine = {
  name: "P大海物語5 MTE2",
  modelName: "型式未登録",
  modelVerified: false,
  modelSourceUrl: "",
  meta: "三洋 | ハイミドル | 3個賞球",
  tags: ["海シリーズ", "m_master連携", "削り込み適用"],
  updatedAt: "2026/06/02 18:42",
  probability: "1/319.6",
  border: "17.36",
  avgPayout: "1,350",
  stdDev: "13,000",
  rotationStdDevPerK: "",
  rushEntry: "60%",
  rushContinue: "75%",
  hesoAvg: "1,500",
  rushAvg: "1,500",
  tsv: ["P大海物語5 MTE2", "319.6", "17.36", "3", "14.0", "1350", "13000", "0.5"],
  heso: [
    { id: "ヘソ1", payout: "1500", ratio: "60", rounds: "10", rush: true },
    { id: "ヘソ2", payout: "1500", ratio: "40", rounds: "10", rush: true },
    { id: "ヘソ3", payout: "0", ratio: "0", rounds: "", rush: false },
  ],
  rush: [
    { id: "RUSH1", payout: "1500", ratio: "100", rounds: "10" },
  ],
};

export function formatNumber(value, fallback = "—") {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
}

// 表示用の整形済み文字列（"1,350" / "60%" など）から入力欄に渡す素の数値文字列を取り出す
export function plainNum(value) {
  return String(value ?? "").replace(/[^0-9.-]/g, "");
}

function toNum(value) {
  const n = Number(plainNum(value));
  return Number.isFinite(n) ? n : 0;
}

function plainText(value) {
  return String(value ?? "").trim();
}

function rawNum(value) {
  const n = toNum(value);
  return n > 0 ? String(n) : "";
}

function rawAnyNum(value) {
  if (value == null || value === "") return "";
  const n = toNum(value);
  return Number.isFinite(n) ? String(n) : "";
}

function parseProbDenom(data) {
  const synthProb = Number(data?.synthProb);
  if (Number.isFinite(synthProb) && synthProb > 0) return synthProb;
  const prob = String(data?.prob || "");
  const m = prob.match(/1\s*\/\s*([0-9.]+)/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

export function sumRatio(heso) {
  const total = heso.reduce((sum, row) => sum + (Number(plainNum(row.ratio)) || 0), 0);
  // 31.6 + 42.2 + ... のような小数割合は、JavaScript内部で
  // 100.00000000000001 になることがあるため、表示精度より細かい桁で丸める。
  return Math.round(total * 1e10) / 1e10;
}

// ラウンド振分文字列をパースする。"4R:50%, 10R:50%" → [{ rounds:"4", rate:"50" }, ...]
// 記録フロー（getMachineRounds / getMachineRushRounds）が読む roundDist / rushDist と同じ表記。
export function parseDist(str) {
  if (typeof str !== "string" || !str.trim()) return [];
  return str
    .split(/[,、/|]/)
    .map((part) => {
      const r = part.match(/(\d+)\s*R/i);
      if (!r) return null;
      const p = part.match(/(\d+)\s*%/);
      return { rounds: r[1], rate: p ? p[1] : "" };
    })
    .filter(Boolean);
}

// 振分の各行から roundDist / rushDist 文字列を生成する（R数が入力された行のみ対象）。
// 記録フローの R数プリセット抽出（roundDist.match(/(\d+)R/g)）に合致する表記で出力する。
export function buildDist(rows) {
  return rows
    .filter((row) => plainNum(row.rounds) !== "")
    .map((row) => `${plainNum(row.rounds)}R:${plainNum(row.ratio) || "0"}%`)
    .join(", ");
}

export function formatProbability(data) {
  const synthProb = parseProbDenom(data);
  if (Number.isFinite(synthProb) && synthProb > 0) return `1/${synthProb}`;
  if (data?.prob) return data.prob;
  return fallbackMachine.probability;
}

export function getBorder1K(data) {
  const direct = Number(data?.border1K);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (data?.border && typeof data.border === "object") {
    const preferred = Number(data.border["4.00"] || data.border["4"] || data.border["等価"]);
    if (Number.isFinite(preferred) && preferred > 0) return preferred;
    const first = Object.values(data.border).map(Number).find((value) => Number.isFinite(value) && value > 0);
    if (first) return first;
  }
  const scalar = Number(data?.border);
  if (Number.isFinite(scalar) && scalar > 0) return scalar;
  return 0;
}

export function formatBorder(data) {
  const border1K = getBorder1K(data);
  if (border1K > 0) return formatNumber(border1K);
  if (data?.borderLabel) return data.borderLabel;
  return fallbackMachine.border;
}

function normalizeAllocationRows(rows, prefix) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 8).map((row, index) => ({
    id: `${prefix}${index + 1}`,
    payout: String(row.payout ?? 0),
    ratio: String(row.rate ?? row.ratio ?? 0),
    rounds: String(row.rounds ?? ""),
    roundsLabel: plainText(row.roundsLabel),
    payoutLabel: plainText(row.payoutLabel),
    label: plainText(row.label),
    destination: plainText(row.destination),
  }));
}

function normalizeAllocationModes(modes, prefix) {
  if (!Array.isArray(modes)) return [];
  return modes
    .map((mode, index) => ({
      id: `${prefix}MODE${index + 1}`,
      name: plainText(mode.name) || `${prefix}${index + 1}`,
      note: plainText(mode.note),
      rows: normalizeAllocationRows(mode.rows, `${prefix}${index + 1}-`),
    }))
    .filter((mode) => mode.rows.length > 0);
}

function pct(value) {
  const n = toNum(value);
  return n > 0 ? `${n}%` : "";
}

function buildTsv(model) {
  const heso = model.heso || [];
  return [
    model.name || "",
    plainNum(model.synthProb),
    plainNum(model.border1K),
    plainNum(model.prize),
    plainNum(model.unitCost),
    plainNum(model.avgPayout),
    plainNum(model.stdDev),
    plainNum(model.initialProb),
    plainNum(model.muraCoef),
    plainNum(model.spatialSens),
    plainNum(model.regimeSens),
    plainNum(model.hesoAvg),
    plainNum(model.rushAvg),
    pct(model.rushEntry),
    pct(model.rushContinue),
    plainNum(model.manualHesoValue),
    plainNum(heso[0]?.payout),
    pct(heso[0]?.ratio),
    plainNum(heso[1]?.payout),
    pct(heso[1]?.ratio),
    plainNum(heso[2]?.payout),
    pct(heso[2]?.ratio),
    plainNum(model.mcExpectedDaily),
    pct(model.mcWinRate),
  ];
}

export function normalizeMachine(data) {
  if (!data) return fallbackMachine;

  const maker = data.maker || "メーカー未設定";
  const type = data.type || "タイプ未設定";
  const prize = Number(data.prize);
  const prizeText = Number.isFinite(prize) && prize > 0 ? ` | ${prize}個賞球` : "";
  const synthProb = parseProbDenom(data);
  const border1K = getBorder1K(data);
  const allocationVerified = data.allocationVerified === true;
  const allocationUsable = allocationVerified || data.isCustom === true;
  // ラウンド振分文字列（初当たり=roundDist / 確変中=rushDist）を行に取り込む。
  // hesoDist と roundDist は機種マスタ上は独立配列のため、件数が一致するときのみ行へ対応付ける。
  const hesoModes = allocationUsable ? normalizeAllocationModes(data.hesoModes, "ヘソ") : [];
  const hesoSrc = Array.isArray(data.hesoDist) ? data.hesoDist.slice(0, 3) : [];
  const roundEntries = parseDist(data.roundDist);
  const heso = !allocationUsable
    ? []
    : hesoModes[0]?.rows?.length > 0
    ? hesoModes[0].rows
    : hesoSrc.length > 0
    ? hesoSrc.map((row, index) => ({
        id: `ヘソ${index + 1}`,
        payout: String(row.payout ?? 0),
        ratio: String(row.rate ?? 0),
        rounds: roundEntries.length === hesoSrc.length ? (roundEntries[index]?.rounds || "") : "",
        rush: Number(row.rate) > 0,
      }))
    : [];

  // 特図2・RUSH（確変中）の出玉振分。機種マスタに rushDist 配列があれば採用し、
  // なければ RUSH平均出玉を 100% の単一振分として初期表示する（後から編集・追加可能）。
  // R数は rushDist 文字列があれば取り込む。
  const rushModes = allocationUsable ? normalizeAllocationModes(data.rushModes, "RUSH") : [];
  const rushAvgNum = Number(data.rushAvgPayout);
  const rushRoundEntries = parseDist(typeof data.rushDist === "string" ? data.rushDist : "");
  const rush = !allocationUsable
    ? []
    : rushModes[0]?.rows?.length > 0
    ? rushModes[0].rows
    : Array.isArray(data.rushDist) && data.rushDist.length > 0
    ? data.rushDist.slice(0, 4).map((row, index) => ({
        id: `RUSH${index + 1}`,
        payout: String(row.payout ?? 0),
        ratio: String(row.rate ?? 0),
        rounds: String(row.rounds ?? ""),
      }))
    : Number.isFinite(rushAvgNum) && rushAvgNum > 0
      ? [{ id: "RUSH1", payout: String(rushAvgNum), ratio: "100", rounds: rushRoundEntries[0]?.rounds || "" }]
      : [];

  const model = {
    name: data.name || fallbackMachine.name,
    modelName: plainText(data.modelName) || fallbackMachine.modelName,
    modelVerified: data.modelVerified === true,
    modelSourceUrl: plainText(data.modelSourceUrl),
    modelUpdatedAt: plainText(data.modelUpdatedAt),
    maker,
    type,
    synthProb: rawNum(synthProb),
    chargeProb: rawNum(data.chargeProb),
    border1K: rawNum(border1K),
    prize: rawNum(data.prize),
    unitCost: rawAnyNum(data.unitCost),
    initialProb: rawAnyNum(data.initialProb ?? 0.5),
    muraCoef: rawAnyNum(data.muraCoef ?? 80000),
    spatialSens: rawAnyNum(data.spatialSens ?? 1),
    regimeSens: rawAnyNum(data.regimeSens ?? 1),
    spec1R: rawAnyNum(data.spec1R),
    specAvgTotalRounds: rawAnyNum(data.specAvgTotalRounds),
    specSapo: rawAnyNum(data.specSapo),
    yutime: {
      triggerLowSpins: rawAnyNum(data.yutime?.triggerLowSpins),
      durationSpins: rawAnyNum(data.yutime?.durationSpins),
      expectedNetBalls: rawAnyNum(data.yutime?.expectedNetBalls),
      durationLabel: plainText(data.yutime?.durationLabel),
      benefit: plainText(data.yutime?.benefit),
      sourceUrl: plainText(data.yutime?.sourceUrl),
      verifiedAt: plainText(data.yutime?.verifiedAt),
      source: plainText(data.yutime?.source) || (data.yutime ? "master" : ""),
    },
    yutimeAudit: {
      status: plainText(data.yutimeAudit?.status) || "unverified",
      verifiedAt: plainText(data.yutimeAudit?.verifiedAt),
      sourceUrl: plainText(data.yutimeAudit?.sourceUrl),
      note: plainText(data.yutimeAudit?.note),
    },
    manualHesoValue: rawAnyNum(data.manualHesoValue),
    mcExpectedDaily: rawAnyNum(data.mcExpectedDaily),
    mcWinRate: rawAnyNum(data.mcWinRate),
    meta: `${maker} | ${type}${prizeText}`,
    tags: [
      data.name?.includes("海") ? "海シリーズ" : "機種検索連携",
      "m_master連携",
      allocationVerified ? "公開振分確認済" : (data.isCustom ? "ユーザー登録振分" : "振分未検証"),
    ],
    updatedAt: plainText(data.dataUpdatedAt) || fallbackMachine.updatedAt,
    probability: formatProbability(data),
    border: formatBorder(data),
    avgPayout: formatNumber(data.avgPayoutPerHit, fallbackMachine.avgPayout),
    stdDev: Number(data.stdDev) > 0 ? formatNumber(data.stdDev) : (data.stdDevLabel || "未公表"),
    rotationStdDevPerK: rawAnyNum(data.rotationStdDevPerK),
    stdDevSource: data.stdDevLabel || (Number(data.stdDev) > 0 ? "登録値" : "未公表"),
    rushEntry: Number(data.rushEntryRate) > 0 ? `${data.rushEntryRate}%` : fallbackMachine.rushEntry,
    rushContinue: Number(data.rushContinueRate) > 0 ? `${data.rushContinueRate}%` : fallbackMachine.rushContinue,
    hesoAvg: formatNumber(data.hesoAvgPayout, fallbackMachine.hesoAvg),
    rushAvg: formatNumber(data.rushAvgPayout, fallbackMachine.rushAvg),
    synced: false,
    tsv: [
      data.name || fallbackMachine.name,
      String(data.synthProb || "").replace(/^1\//, "") || fallbackMachine.tsv[1],
      formatBorder(data),
      String(data.prize || ""),
      String(data.unitCost || ""),
      String(data.avgPayoutPerHit || ""),
      String(data.stdDev || ""),
      "0.5",
    ],
    heso,
    rush,
    hesoModes,
    rushModes,
    allocationVerified,
    allocationUsable,
    hasExplicitAllocationModes: Array.isArray(data.hesoModes) || Array.isArray(data.rushModes),
    allocationNote: plainText(data.allocationNote),
    roundDist: data.roundDist || fallbackMachine.roundDist || "1500発 100%",
    rushDist: data.rushDist || fallbackMachine.rushDist || "1500発 100%",
  };
  return {
    ...model,
    tsv: buildTsv(model),
  };
}

// 文字列化した数値が等しいか（"60" と "60.0"、"" と undefined を吸収して比較）
function plainEq(a, b) {
  return plainNum(a) === plainNum(b);
}

// 振分行（payout / ratio / rounds）が初期表示から変わったか
function rowsChanged(rows = [], initRows = []) {
  if (rows.length !== initRows.length) return true;
  return rows.some((r, i) =>
    !plainEq(r.payout, initRows[i]?.payout) ||
    !plainEq(r.ratio, initRows[i]?.ratio) ||
    !plainEq(r.rounds, initRows[i]?.rounds)
  );
}

function textEq(a, b) {
  return plainText(a) === plainText(b);
}

function writeTextIfChanged(out, key, value, initValue) {
  if (!textEq(value, initValue)) out[key] = plainText(value);
}

function writeNumIfChanged(out, key, value, initValue) {
  if (!plainEq(value, initValue)) out[key] = toNum(value);
}

// 編集後の表示モデル（model）を、元データ（rawSource）のスキーマへ書き戻した
// 保存用カスタム機種レコードを生成する。
//
// 矛盾防止の原則:
//  - 元データの全フィールドを継承し、ユーザーが編集した項目だけ上書きする（fallback 既定値を捏造しない）
//  - roundDist/rushDist は行データから再生成し、未入力なら元データの生値にフォールバック（placeholder は使わない）
//  - hesoDist は元データにあった、または行が変更された場合のみ書き戻す
export function buildMachineOverride(rawSource, model) {
  const init = normalizeMachine(rawSource);
  const out = {
    ...(rawSource || {}),
    id: rawSource?.id ?? Date.now(),
    isCustom: true,
    name: rawSource?.name ?? model.name,
  };

  writeTextIfChanged(out, "name", model.name, init.name);
  writeTextIfChanged(out, "maker", model.maker, init.maker);
  writeTextIfChanged(out, "type", model.type, init.type);

  if (!plainEq(model.synthProb, init.synthProb)) {
    const synthProb = toNum(model.synthProb);
    out.synthProb = synthProb;
    out.prob = synthProb > 0 ? `1/${synthProb}` : "0";
  }
  writeNumIfChanged(out, "chargeProb", model.chargeProb, init.chargeProb);
  if (!plainEq(model.border1K, init.border1K)) {
    const border1K = toNum(model.border1K);
    out.border1K = border1K;
    out.border = {
      ...(rawSource?.border && typeof rawSource.border === "object" ? rawSource.border : {}),
      "4.00": border1K,
    };
  }
  writeNumIfChanged(out, "prize", model.prize, init.prize);
  writeNumIfChanged(out, "unitCost", model.unitCost, init.unitCost);
  writeNumIfChanged(out, "initialProb", model.initialProb, init.initialProb);
  writeNumIfChanged(out, "muraCoef", model.muraCoef, init.muraCoef);
  writeNumIfChanged(out, "rotationStdDevPerK", model.rotationStdDevPerK, init.rotationStdDevPerK);
  writeNumIfChanged(out, "spatialSens", model.spatialSens, init.spatialSens);
  writeNumIfChanged(out, "regimeSens", model.regimeSens, init.regimeSens);
  writeNumIfChanged(out, "spec1R", model.spec1R, init.spec1R);
  writeNumIfChanged(out, "specAvgTotalRounds", model.specAvgTotalRounds, init.specAvgTotalRounds);
  writeNumIfChanged(out, "specSapo", model.specSapo, init.specSapo);
  writeNumIfChanged(out, "manualHesoValue", model.manualHesoValue, init.manualHesoValue);
  writeNumIfChanged(out, "mcExpectedDaily", model.mcExpectedDaily, init.mcExpectedDaily);
  writeNumIfChanged(out, "mcWinRate", model.mcWinRate, init.mcWinRate);

  const modelYutime = model.yutime || {};
  const initYutime = init.yutime || {};
  const yutimeChanged =
    !plainEq(modelYutime.triggerLowSpins, initYutime.triggerLowSpins) ||
    !plainEq(modelYutime.durationSpins, initYutime.durationSpins) ||
    !plainEq(modelYutime.expectedNetBalls, initYutime.expectedNetBalls) ||
    !textEq(modelYutime.durationLabel, initYutime.durationLabel) ||
    !textEq(modelYutime.benefit, initYutime.benefit) ||
    !textEq(modelYutime.sourceUrl, initYutime.sourceUrl) ||
    !textEq(modelYutime.verifiedAt, initYutime.verifiedAt);
  if (yutimeChanged) {
    const triggerLowSpins = toNum(modelYutime.triggerLowSpins);
    out.yutime = triggerLowSpins > 0 ? {
      triggerLowSpins,
      durationSpins: toNum(modelYutime.durationSpins),
      expectedNetBalls: modelYutime.expectedNetBalls === "" ? null : toNum(modelYutime.expectedNetBalls),
      durationLabel: plainText(modelYutime.durationLabel),
      benefit: plainText(modelYutime.benefit),
      sourceUrl: plainText(modelYutime.sourceUrl),
      verifiedAt: plainText(modelYutime.verifiedAt),
      source: "manual",
    } : null;
  }

  // 振分（ラウンド数）→ 記録フロー用の roundDist / rushDist
  const hesoChanged = rowsChanged(model.heso, init.heso);
  const rushChanged = rowsChanged(model.rush, init.rush);
  out.roundDist = hesoChanged ? (buildDist(model.heso) || rawSource?.roundDist || "") : (rawSource?.roundDist || "");
  out.rushDist = rushChanged ? (buildDist(model.rush) || rawSource?.rushDist || "") : (rawSource?.rushDist || "");

  // 状態別振分を持つ機種では、編集対象の先頭モードだけを書き換え、上位RUSHなど他モードは保全する。
  if (Array.isArray(rawSource?.hesoModes) && hesoChanged) {
    out.hesoModes = rawSource.hesoModes.map((mode, modeIndex) => modeIndex > 0 ? mode : ({
      ...mode,
      rows: model.heso.map((row, index) => ({
        ...(mode.rows?.[index] || {}),
        payout: toNum(row.payout),
        rate: toNum(row.ratio),
        rounds: toNum(row.rounds),
      })),
    }));
  }
  if (Array.isArray(rawSource?.rushModes) && rushChanged) {
    out.rushModes = rawSource.rushModes.map((mode, modeIndex) => modeIndex > 0 ? mode : ({
      ...mode,
      rows: model.rush.map((row, index) => ({
        ...(mode.rows?.[index] || {}),
        payout: toNum(row.payout),
        rate: toNum(row.ratio),
        rounds: toNum(row.rounds),
      })),
    }));
  }

  // hesoDist（出玉×比率）。行が変更された場合だけ書き換える。
  // 未検証機種は画面上の行を空にするため、無編集保存で元の生データを消してはいけない。
  if (hesoChanged) {
    out.hesoDist = model.heso
      .filter((h) => toNum(h.payout) > 0 || toNum(h.ratio) > 0)
      .map((h) => ({ payout: toNum(h.payout), rate: toNum(h.ratio) }));
  }

  // P-EVIDENCE 数値: 初期表示から変更された項目だけ上書き
  writeNumIfChanged(out, "avgPayoutPerHit", model.avgPayout, init.avgPayout);
  writeNumIfChanged(out, "stdDev", model.stdDev, init.stdDev);
  writeNumIfChanged(out, "rushEntryRate", model.rushEntry, init.rushEntry);
  writeNumIfChanged(out, "rushContinueRate", model.rushContinue, init.rushContinue);
  writeNumIfChanged(out, "rushAvgPayout", model.rushAvg, init.rushAvg);
  writeNumIfChanged(out, "hesoAvgPayout", model.hesoAvg, init.hesoAvg);

  return out;
}

export { buildTsv };
