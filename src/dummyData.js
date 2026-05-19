// 偵察モード等で使うダミーデータ群（Phase 3 で導入）
//
// 実データへの切り替えポリシー:
//   - 「店舗実績」タブは既存 archives から派生集計するため不要
//   - 「本日予測」タブは Phase 5 (P-EVIDENCE 移植) 完了後に実データに切り替える予定
//   - 「イベント」タブは情報ソース未定のため空表示
//
// ダミーは日付シードで決定論的に揺らがせる（同じ日は同じ並び・同じ数値）。
// localStorage には保存しない（純粋関数で導出）。

// 文字列をシード化（簡易）
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

// 線形合同法 (LCG) — シードを与えると決定論的な擬似乱数列を返す
function rngFactory(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// 「YYYY-MM-DD」形式の文字列を返す
export function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 「HH:MM」形式（24h）
export function timeLabel(now = new Date()) {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// 1〜5 位のダミー店舗ランキングを返す（日付シードで決定論的）
//   返却: [{ rank, storeName, expectedValue, winRate, verdict, source: "dummy" }]
//   verdict: "strong" | "neutral" | "weak"
const DUMMY_STORE_POOL = [
  "P大海物語5 MTE2",
  "マルハン渋谷東口店",
  "ガイア吉祥寺店",
  "オリエンタル町田店",
  "エスパス日拓上野新館",
  "新世界エヴァンゲリオン",
  "京楽パチンコ",
  "ニラク仙台店",
];

export function getDummyStoreRanking(dateStr = todayKey(), limit = 5) {
  const rng = rngFactory(hashSeed(`scout-store-${dateStr}`));
  // 店舗をシャッフル
  const shuffled = [...DUMMY_STORE_POOL].sort(() => rng() - 0.5);
  const picked = shuffled.slice(0, limit);
  return picked.map((name, i) => {
    // 上位ほど高めの期待値
    const base = 12000 - i * 1800;
    const noise = Math.round((rng() - 0.5) * 2400);
    const expectedValue = Math.max(800, base + noise);
    // 勝率: 上位 65-75%, 下位 45-55%
    const winRate = Math.round((0.75 - i * 0.05 + (rng() - 0.5) * 0.08) * 1000) / 10;
    let verdict = "neutral";
    if (expectedValue >= 8000) verdict = "strong";
    else if (expectedValue < 3000) verdict = "weak";
    return {
      rank: i + 1,
      storeName: name,
      expectedValue,
      winRate,
      verdict,
      source: "dummy",
    };
  });
}

// 本日の注目ポイント（3〜5件、日付シードで決定論的）
const DUMMY_HIGHLIGHT_POOL = [
  "並び3箇所目で高稼働の可能性",
  "大海5の投入傾向が強い",
  "特定日（7のつく日）",
  "新台入替後の3日目",
  "甘デジ稼働が高い時間帯",
  "イベント告知 P-WORLD 新規",
  "前週末の出玉実績が良好",
  "島端で高ベース機の傾向",
];

export function getDummyHighlights(dateStr = todayKey(), count = 4) {
  const rng = rngFactory(hashSeed(`scout-highlight-${dateStr}`));
  const pool = [...DUMMY_HIGHLIGHT_POOL].sort(() => rng() - 0.5);
  return pool.slice(0, count);
}
