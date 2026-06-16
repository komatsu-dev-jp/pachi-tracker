// 戦略マップ用 表示データ（プロトタイプ・純粋関数）
//
// ⚠️ 仮データ（将来連携予定）:
//   本ファイルが返す各台の「推定回転率・確信度・期待値・ボーダー差」は、
//   戦略マップ画面の見た目を確認するためのサンプル表示専用データ。
//   将来的には差玉解析（pt_deltaScans）と台選びの島データ（pt_hallMaps）から
//   算出した実データへ差し替える。
//   src/logic.js の計算ロジックには一切依存・変更しない（表示専用）。
//
// 画面内のヘッダー候補数・KPI・TOP5・島評価は、すべてここで生成した同一の
// 台配列から導出するため、表示間で数値が矛盾しない。

// 島ごとの基準ボーダー（仮値）。将来は機種スペック・釘調整から算出予定。
const DEFAULT_BORDER = 16.8;

// 決定論的擬似乱数（mulberry32）。同じシードで常に同じ配置を返す。
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

// ボーダー差・確信度から判定区分を決める。
//   strong : ボーダー超え（緑）
//   watch  : 様子見（黄）
//   weak   : ボーダー未満（赤）
//   nodata : データ不足（灰）
function classify(borderDiff, confidence) {
  if (confidence < 40) return "nodata";
  if (borderDiff >= 0.8) return "strong";
  if (borderDiff >= -0.4) return "watch";
  return "weak";
}

function scoreOf(m) {
  return (
    m.borderDiff * 8 +
    m.confidence * 0.4 +
    (m.isStar ? 6 : 0) +
    (m.verdict === "strong" ? 4 : 0)
  );
}

function buildMachine(num, islandId, rot, confidence, border) {
  const borderDiff = round1(rot - border);
  const evPerHour = Math.round(((rot - border) * 820) / 10) * 10;
  const verdict = classify(borderDiff, confidence);
  const isStar = verdict === "strong" && borderDiff >= 1.8 && confidence >= 72;
  const m = {
    id: `m-${num}`,
    num,
    islandId,
    rot,
    confidence,
    border,
    borderDiff,
    evPerHour,
    verdict,
    isStar,
    // 過去7日の推定回転率（仮・将来は実履歴へ差し替え）
    history: buildHistory(rot, num),
  };
  m.score = scoreOf(m);
  return m;
}

function buildHistory(rot, num) {
  const r = makeRng(num * 7 + 13);
  const out = [];
  for (let i = 0; i < 7; i++) {
    out.push(round1(rot - 1.6 + r() * 3.2));
  }
  out[6] = rot; // 当日は現在の推定値で締める
  return out;
}

// 良台率から島評価（仮の文字グレード）を返す。
function islandGrade(goodRate) {
  if (goodRate >= 0.5) return "A-";
  if (goodRate >= 0.38) return "B+";
  if (goodRate >= 0.28) return "B";
  if (goodRate >= 0.18) return "C+";
  return "C";
}

function summarizeIsland(island) {
  const list = island.machines;
  const strong = list.filter((m) => m.verdict === "strong");
  const goodRate = list.length ? strong.length / list.length : 0;
  const evDensity = strong.length
    ? Math.round(strong.reduce((a, m) => a + m.evPerHour, 0) / strong.length)
    : 0;
  const best = [...list].sort((a, b) => b.score - a.score)[0] || null;
  return {
    ...island,
    grade: islandGrade(goodRate),
    goodRate: Math.round(goodRate * 100),
    candidates: strong.length,
    evDensity,
    strongZone: best ? `${best.num}番周辺` : "—",
  };
}

// 戦略マップ全体の表示データを生成する。
// playingNum を渡すと、その台番号を「実戦中」としてマークする。
export function buildStrategyMap({ playingNum = null } = {}) {
  const islandDefs = [
    { id: 1, name: "1島", start: 776 },
    { id: 2, name: "2島", start: 790 },
    { id: 3, name: "3島", start: 804 },
  ];
  const perIsland = 14;
  const r = makeRng(20260616);
  const playing = playingNum != null ? Number(playingNum) : null;

  const islands = islandDefs.map((def) => {
    const machines = [];
    for (let i = 0; i < perIsland; i++) {
      const num = def.start + i;
      let rot;
      let confidence;
      if (num === 790) {
        // 本日の本命（モック基準値）
        rot = 19.7;
        confidence = 84;
      } else {
        // 790（本命）を本日のTOP1に保つため上限を 19.4 に抑える
        rot = round1(14.6 + r() * 4.8);
        confidence = Math.round(30 + r() * 60);
      }
      const m = buildMachine(num, def.id, rot, confidence, DEFAULT_BORDER);
      if (playing != null && m.num === playing) m.isPlaying = true;
      machines.push(m);
    }
    return summarizeIsland({ ...def, machines });
  });

  const all = islands.flatMap((isl) => isl.machines);
  const candidates = all.filter((m) => m.verdict === "strong");
  const top5 = [...all]
    .filter((m) => m.verdict !== "nodata")
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((m, i) => ({ ...m, rank: i + 1 }));

  const lead = top5[0] || null;
  const kpi = {
    evPerHour: lead ? lead.evPerHour : 0,
    rot: lead ? lead.rot : 0,
    confidence: lead ? lead.confidence : 0,
    candidates: candidates.length,
  };

  const islandAvgRot = (id) => {
    const list = all.filter((m) => m.islandId === id);
    if (!list.length) return 0;
    return round1(list.reduce((a, m) => a + m.rot, 0) / list.length);
  };

  return {
    machineName: "eシン・エヴァンゲリオン",
    total: all.length,
    border: DEFAULT_BORDER,
    islands,
    all,
    candidates,
    top5,
    kpi,
    leadId: lead ? lead.id : (all[0] ? all[0].id : null),
    islandAvgRot,
  };
}
