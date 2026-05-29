// バッジ定義と解放判定（Phase 6 バッジ解放）
//
// ハンターランクの育成感を補強する達成バッジ群。
// XP・連続日数・セッション数・回転数・大当たり数のマイルストーンを純関数で評価する。
//
// データ受け渡しの取り決め:
//   - rank.unlockedBadges: string[]   バッジID 配列（永続化される）
//   - BADGES 配列          固定順序。表示順 = 解放難易度の昇順を目安
//   - evaluateBadgeUnlocks(metrics, alreadyUnlocked)
//       条件成立かつ未解放のバッジを返す（破壊的変更なし）
//   - unlockBadges(rank, newIds)
//       新規IDを unlockedBadges へ追加した新 rank を返す（純関数）

import { initialRank } from "./hunterRank.js";

// バッジ定義
// condition は metrics オブジェクトを受け取り boolean を返す純関数。
// metrics の型は computeBadgeMetrics の戻り値（後述）。
export const BADGES = [
  {
    id: "first_jp",
    label: "初撃破",
    description: "初めての大当たりを記録",
    icon: "★",
    color: "var(--yellow)",
    condition: (m) => m.lifetimeHits >= 1,
  },
  {
    id: "sessions_10",
    label: "ホール常連",
    description: "セッションを 10 回完走",
    icon: "▣",
    color: "var(--teal)",
    condition: (m) => m.sessionsCount >= 10,
  },
  {
    id: "sessions_50",
    label: "通い詰め",
    description: "セッションを 50 回完走",
    icon: "▦",
    color: "var(--teal)",
    condition: (m) => m.sessionsCount >= 50,
  },
  {
    id: "lv5",
    label: "新人ハンター",
    description: "ハンターランク Lv5 到達",
    icon: "▲",
    color: "var(--blue)",
    condition: (m) => m.level >= 5,
  },
  {
    id: "lv10",
    label: "中堅ハンター",
    description: "ハンターランク Lv10 到達",
    icon: "▲",
    color: "var(--blue)",
    condition: (m) => m.level >= 10,
  },
  {
    id: "lv25",
    label: "一流ハンター",
    description: "ハンターランク Lv25 到達",
    icon: "♦",
    color: "var(--purple)",
    condition: (m) => m.level >= 25,
  },
  {
    id: "xp_10k",
    label: "経験値1万",
    description: "通算 10,000 EXP を獲得",
    icon: "✦",
    color: "var(--purple)",
    condition: (m) => m.totalXp >= 10000,
  },
  {
    id: "streak_3",
    label: "三日突破",
    description: "3 日連続稼働",
    icon: "◆",
    color: "var(--orange)",
    condition: (m) => m.streakDays >= 3,
  },
  {
    id: "streak_7",
    label: "一週間達成",
    description: "7 日連続稼働",
    icon: "◆",
    color: "var(--orange)",
    condition: (m) => m.streakDays >= 7,
  },
  {
    id: "streak_30",
    label: "月皆勤",
    description: "30 日連続稼働",
    icon: "✪",
    color: "var(--red)",
    condition: (m) => m.streakDays >= 30,
  },
  {
    id: "rot_10k",
    label: "1万回転",
    description: "通算 10,000 回転",
    icon: "◉",
    color: "var(--green)",
    condition: (m) => m.lifetimeRot >= 10000,
  },
  {
    id: "jp_100",
    label: "百撃必中",
    description: "通算 100 回の大当たり",
    icon: "✪",
    color: "var(--green)",
    condition: (m) => m.lifetimeHits >= 100,
  },
];

// バッジID → 定義 のルックアップ
const BADGE_BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b]));

export function getBadgeById(id) {
  return BADGE_BY_ID[id] || null;
}

// 評価用 metrics を archives / 現在セッションから集計する。
// archives 形状は handleMoveTable() が生成する構造に依存。
// 互換性のため、欠損プロパティは安全に 0 として扱う。
export function computeBadgeMetrics({
  rank,
  hunterCounters = {},
  archives = [],
  jpLog = [],
  ev = null,
} = {}) {
  const safeRank = rank && typeof rank === "object" ? rank : initialRank();
  const level = Math.max(1, Math.floor(Number(safeRank.level) || 1));
  const totalXp = Math.max(0, Math.floor(Number(safeRank.totalXp) || 0));
  const streakDays = Math.max(0, Math.floor(Number(hunterCounters?.streakDays) || 0));

  const archiveList = Array.isArray(archives) ? archives : [];
  // 仕様: handleMoveTable で生成された isMoveArchive=true もセッション完走相当として 1 件と数える
  const sessionsCount = archiveList.filter((a) => a && typeof a === "object").length;

  const currentHits = Array.isArray(jpLog)
    ? jpLog.reduce((sum, c) => sum + (Array.isArray(c?.hits) ? c.hits.length : 0), 0)
    : 0;
  const archiveHits = archiveList.reduce((sum, a) => {
    if (!a || !Array.isArray(a.jpLog)) return sum;
    return sum + a.jpLog.reduce((s, c) => s + (Array.isArray(c?.hits) ? c.hits.length : 0), 0);
  }, 0);
  const lifetimeHits = archiveHits + currentHits;

  const currentRot = Math.max(0, Math.floor(Number(ev?.netRot) || 0));
  const archiveRot = archiveList.reduce((sum, a) => {
    const r = Number(a?.stats?.netRot);
    return sum + (Number.isFinite(r) && r > 0 ? Math.floor(r) : 0);
  }, 0);
  const lifetimeRot = archiveRot + currentRot;

  return { level, totalXp, streakDays, sessionsCount, lifetimeHits, lifetimeRot };
}

// 条件成立かつ未解放のバッジ定義配列を返す（順序は BADGES と同じ）
export function evaluateBadgeUnlocks(metrics, alreadyUnlocked = []) {
  const safe = metrics && typeof metrics === "object" ? metrics : {};
  const set = new Set(Array.isArray(alreadyUnlocked) ? alreadyUnlocked : []);
  const out = [];
  for (const b of BADGES) {
    if (set.has(b.id)) continue;
    let ok = false;
    try { ok = !!b.condition(safe); } catch { ok = false; }
    if (ok) out.push(b);
  }
  return out;
}

// 新規バッジ ID を unlockedBadges に追加した新 rank を返す（純関数）
export function unlockBadges(rank, newIds) {
  const base = rank && typeof rank === "object" ? rank : initialRank();
  const current = Array.isArray(base.unlockedBadges) ? base.unlockedBadges : [];
  const ids = Array.isArray(newIds) ? newIds : [];
  if (ids.length === 0) return base;
  const set = new Set(current);
  for (const id of ids) if (id) set.add(String(id));
  // BADGES の定義順で安定化（後で UI 表示時の順序ずれを防ぐ）
  const ordered = BADGES.map((b) => b.id).filter((id) => set.has(id));
  // 未知の ID（将来の互換性のため）は末尾に保持
  const unknown = Array.from(set).filter((id) => !BADGES.some((b) => b.id === id));
  return { ...base, unlockedBadges: [...ordered, ...unknown] };
}
