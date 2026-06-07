// 機種スペック画面（MachineSpecWorkspace）の純ロジック。
// React / CSS に依存しないため、node から直接 import してテストできる。
// 表示モデル（normalizeMachine）と、保存用カスタム機種レコード生成（buildMachineOverride）を提供する。

export const fallbackMachine = {
  name: "P大海物語5 MTE2",
  meta: "三洋 | ハイミドル | 3個賞球",
  tags: ["海シリーズ", "m_master連携", "削り込み適用"],
  updatedAt: "2026/06/02 18:42",
  probability: "1/319.6",
  border: "17.36",
  avgPayout: "1,350",
  stdDev: "13,000",
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

export function sumRatio(heso) {
  return heso.reduce((sum, row) => sum + (Number(plainNum(row.ratio)) || 0), 0);
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
  if (data?.prob) return data.prob;
  const synthProb = Number(data?.synthProb);
  if (Number.isFinite(synthProb) && synthProb > 0) return `1/${synthProb}`;
  return fallbackMachine.probability;
}

export function formatBorder(data) {
  if (data?.border && typeof data.border === "object") {
    const preferred = data.border["4.00"] || data.border["4"] || data.border["等価"];
    if (preferred) return formatNumber(preferred);
    const first = Object.values(data.border).find((value) => Number(value) > 0);
    if (first) return formatNumber(first);
  }
  if (data?.border) return formatNumber(data.border);
  return fallbackMachine.border;
}

export function normalizeMachine(data) {
  if (!data) return fallbackMachine;

  const maker = data.maker || "メーカー未設定";
  const type = data.type || "タイプ未設定";
  const prize = Number(data.prize);
  const prizeText = Number.isFinite(prize) && prize > 0 ? ` | ${prize}個賞球` : "";
  // ラウンド振分文字列（初当たり=roundDist / 確変中=rushDist）を行に取り込む。
  // hesoDist と roundDist は機種マスタ上は独立配列のため、件数が一致するときのみ行へ対応付ける。
  const hesoSrc = Array.isArray(data.hesoDist) ? data.hesoDist.slice(0, 3) : [];
  const roundEntries = parseDist(data.roundDist);
  const heso = hesoSrc.length > 0
    ? hesoSrc.map((row, index) => ({
        id: `ヘソ${index + 1}`,
        payout: String(row.payout ?? 0),
        ratio: String(row.rate ?? 0),
        rounds: roundEntries.length === hesoSrc.length ? (roundEntries[index]?.rounds || "") : "",
        rush: Number(row.rate) > 0,
      }))
    : fallbackMachine.heso;

  // 特図2・RUSH（確変中）の出玉振分。機種マスタに rushDist 配列があれば採用し、
  // なければ RUSH平均出玉を 100% の単一振分として初期表示する（後から編集・追加可能）。
  // R数は rushDist 文字列があれば取り込む。
  const rushAvgNum = Number(data.rushAvgPayout);
  const rushRoundEntries = parseDist(typeof data.rushDist === "string" ? data.rushDist : "");
  const rush = Array.isArray(data.rushDist) && data.rushDist.length > 0
    ? data.rushDist.slice(0, 4).map((row, index) => ({
        id: `RUSH${index + 1}`,
        payout: String(row.payout ?? 0),
        ratio: String(row.rate ?? 0),
        rounds: String(row.rounds ?? ""),
      }))
    : Number.isFinite(rushAvgNum) && rushAvgNum > 0
      ? [{ id: "RUSH1", payout: String(rushAvgNum), ratio: "100", rounds: rushRoundEntries[0]?.rounds || "" }]
      : fallbackMachine.rush;

  return {
    name: data.name || fallbackMachine.name,
    meta: `${maker} | ${type}${prizeText}`,
    tags: [
      data.name?.includes("海") ? "海シリーズ" : "機種検索連携",
      "m_master連携",
      "削り込み適用",
    ],
    updatedAt: fallbackMachine.updatedAt,
    probability: formatProbability(data),
    border: formatBorder(data),
    avgPayout: formatNumber(data.avgPayoutPerHit, fallbackMachine.avgPayout),
    stdDev: formatNumber(data.stdDev, fallbackMachine.stdDev),
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
    roundDist: data.roundDist || fallbackMachine.roundDist || "1500発 100%",
    rushDist: data.rushDist || fallbackMachine.rushDist || "1500発 100%",
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

// 数値文字列を数値へ（不正は 0）
function toNum(value) {
  const n = Number(plainNum(value));
  return Number.isFinite(n) ? n : 0;
}

// 編集後の表示モデル（model）を、元データ（rawSource）のスキーマへ書き戻した
// 保存用カスタム機種レコードを生成する。
//
// 矛盾防止の原則:
//  - 元データの全フィールドを継承し、読み取り専用項目（synthProb/spec/border/prob/prize等）は触らない
//  - 出玉系の数値は「ユーザーが初期表示から変更した項目」だけ上書きする（fallback 既定値を捏造しない）
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

  // 振分（ラウンド数）→ 記録フロー用の roundDist / rushDist
  out.roundDist = buildDist(model.heso) || rawSource?.roundDist || "";
  out.rushDist = buildDist(model.rush) || rawSource?.rushDist || "";

  // hesoDist（出玉×比率）。元データに在った or 行が変更された場合のみ。
  if (Array.isArray(rawSource?.hesoDist) || rowsChanged(model.heso, init.heso)) {
    out.hesoDist = model.heso
      .filter((h) => toNum(h.payout) > 0 || toNum(h.ratio) > 0)
      .map((h) => ({ payout: toNum(h.payout), rate: toNum(h.ratio) }));
  }

  // 出玉系数値: 初期表示から変更された項目だけ上書き
  if (!plainEq(model.avgPayout, init.avgPayout)) out.avgPayoutPerHit = toNum(model.avgPayout);
  if (!plainEq(model.stdDev, init.stdDev)) out.stdDev = toNum(model.stdDev);
  if (!plainEq(model.rushEntry, init.rushEntry)) out.rushEntryRate = toNum(model.rushEntry);
  if (!plainEq(model.rushContinue, init.rushContinue)) out.rushContinueRate = toNum(model.rushContinue);
  if (!plainEq(model.rushAvg, init.rushAvg)) out.rushAvgPayout = toNum(model.rushAvg);
  if (!plainEq(model.hesoAvg, init.hesoAvg)) out.hesoAvgPayout = toNum(model.hesoAvg);

  return out;
}
