// 台選びモード用セレクタ（純粋関数）
//
// P-EVIDENCE 由来の島・台データを、台選び UI 用の形へ正規化する。

const VERDICT_ORDER = {
  strong: 4,
  good: 3,
  watch: 2,
  avoid: 1,
  unknown: 0,
};

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeMachineRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(Boolean)
    .map((row, i) => {
      const confidence = Math.max(0, Math.min(100, Math.round(num(row.confidence))));
      const borderDiff = Math.round(num(row.borderDiff) * 10) / 10;
      const evPerK = Math.round(num(row.evPerK));
      const verdict = row.verdict || (
        confidence >= 76 && borderDiff >= 2 ? "strong" :
        confidence >= 60 && borderDiff >= 0.5 ? "good" :
        confidence >= 42 ? "watch" :
        "avoid"
      );
      return {
        id: row.id || `machine-${row.machineNumber || i}`,
        machineNumber: row.machineNumber || i + 1,
        machineName: row.machineName || "機種未設定",
        evPerK,
        borderDiff,
        confidence,
        verdict,
        source: row.source || "real",
        isPlaying: !!row.isPlaying,
        sampleRot: Math.max(0, Math.round(num(row.sampleRot))),
        lastSignal: row.lastSignal || "実測データ",
        score: calcMachineScore({ confidence, borderDiff, evPerK, verdict }),
      };
    });
}

export function calcMachineScore(machine) {
  const confidence = num(machine.confidence);
  const borderDiff = num(machine.borderDiff);
  const evPerK = num(machine.evPerK);
  const verdictScore = VERDICT_ORDER[machine.verdict] ?? 0;
  return Math.round(
    confidence * 0.58 +
    Math.max(-12, Math.min(28, borderDiff * 5)) +
    Math.max(-12, Math.min(18, evPerK / 80)) +
    verdictScore * 4
  );
}

export function filterMachines(rows, filter = "all") {
  const list = normalizeMachineRows(rows);
  if (filter === "candidates") {
    return list.filter((m) => m.verdict === "strong" || m.verdict === "good");
  }
  if (filter === "playing") {
    return list.filter((m) => m.isPlaying);
  }
  return list;
}

export function getGoodMachineCandidates(rows, limit = 5) {
  return normalizeMachineRows(rows)
    .filter((m) => m.verdict !== "avoid")
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.evPerK - a.evPerK;
    })
    .slice(0, limit)
    .map((m, i) => ({ ...m, rank: i + 1 }));
}

export function summarizeIsland(rows) {
  const list = normalizeMachineRows(rows);
  if (list.length === 0) {
    return {
      total: 0,
      candidates: 0,
      playing: 0,
      averageConfidence: 0,
      best: null,
    };
  }
  const candidates = list.filter((m) => m.verdict === "strong" || m.verdict === "good");
  const confidenceTotal = list.reduce((sum, m) => sum + m.confidence, 0);
  const top = getGoodMachineCandidates(list, 1)[0] || null;
  return {
    total: list.length,
    candidates: candidates.length,
    playing: list.filter((m) => m.isPlaying).length,
    averageConfidence: Math.round(confidenceTotal / list.length),
    best: top,
  };
}
