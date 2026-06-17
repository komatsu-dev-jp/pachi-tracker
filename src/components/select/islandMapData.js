// 島マップ管理：レイアウト図 / ホール全体プレビュー用の派生表示データ（純粋関数）
//
// ⚠️ 仮データ（将来連携予定）:
//   各台の「推定回転率・確信度」と、そこから導く島の「良台率・期待値密度・
//   強ゾーン・判定区分（緑／黄／赤／灰）」は、島マップ管理画面の見た目を確認する
//   ためのサンプル表示専用データ。実体の島配置（pt_hallMaps の start/end）からは
//   台番号のみを取り出し、指標は台番号をシードにした決定論的擬似乱数で生成する。
//   将来的には差玉解析（pt_deltaScans）・台選び島データ・P-EVIDENCE の実データへ
//   差し替える。src/logic.js の計算ロジックには一切依存・変更しない（表示専用）。
//   ※戦略マップ画面（strategyMapData.js）と同じ配色・判定ルールに揃える。

import { normalizeIsland, islandCount } from "./hallMapSelectors";

// 島ごとの基準ボーダー（仮値）。将来は機種スペック・釘調整から算出予定。
const DEFAULT_BORDER = 16.8;

// 1島あたりに描画する台セルの上限（極端な範囲指定時のパフォーマンス保護）。
const MAX_CELLS = 120;

// 決定論的擬似乱数（mulberry32）。同じシードで常に同じ値を返す。
function makeRng(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// ボーダー差・確信度から判定区分を決める（戦略マップと同一ルール）。
//   strong : ボーダー超え（緑）
//   watch  : 様子見（黄）
//   weak   : ボーダー未満（赤）
//   nodata : データ不足（灰）
export function classifyVerdict(borderDiff, confidence) {
  if (confidence < 40) return "nodata";
  if (borderDiff >= 0.8) return "strong";
  if (borderDiff >= -0.4) return "watch";
  return "weak";
}

// 台1件分の仮指標を台番号シードから決定論的に生成する。
function buildMachine(islandId, num) {
  const r = makeRng(num * 7 + 13);
  const rot = round1(14.6 + r() * 4.8);
  const confidence = Math.round(30 + r() * 60);
  const borderDiff = round1(rot - DEFAULT_BORDER);
  const evPerHour = Math.round(((rot - DEFAULT_BORDER) * 820) / 10) * 10;
  const verdict = classifyVerdict(borderDiff, confidence);
  return {
    id: `m-${islandId}-${num}`,
    num,
    rot,
    confidence,
    borderDiff,
    evPerHour,
    verdict,
  };
}

// 島1件分のレイアウト表示データ（台セル＋集計指標）を生成する。
export function buildIslandLayout(island) {
  const isl = normalizeIsland(island);
  const total = islandCount(isl);
  const cells = Math.max(0, Math.min(total, MAX_CELLS));
  const machines = [];
  for (let i = 0; i < cells; i++) {
    machines.push(buildMachine(isl.id, isl.start + i));
  }
  const strong = machines.filter((m) => m.verdict === "strong");
  const goodRate = machines.length ? Math.round((strong.length / machines.length) * 100) : 0;
  const evDensity = strong.length
    ? Math.round(strong.reduce((a, m) => a + m.evPerHour, 0) / strong.length)
    : 0;
  const best = [...machines].sort((a, b) => b.rot - a.rot)[0] || null;
  const strongZone = best && best.verdict !== "nodata" ? `${best.num}番周辺` : "—";
  return {
    id: isl.id,
    name: isl.name,
    machineName: isl.machineName,
    start: isl.start,
    end: isl.end,
    count: total,
    truncated: total > cells,
    machines,
    goodRate,
    evDensity,
    strongZone,
  };
}

// 店舗1件分の全島レイアウト＋ホール集計（総島数・総台数）を生成する。
export function buildHallLayout(islands) {
  const list = Array.isArray(islands) ? islands : [];
  const layouts = list.map((isl) => buildIslandLayout(isl));
  const totalIslands = layouts.length;
  const totalMachines = layouts.reduce((a, l) => a + l.count, 0);
  return { layouts, totalIslands, totalMachines };
}
