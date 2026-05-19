// ハンターランク（Phase 6 本実装版）
//
// 育成感を提供するモチベ維持装置。
// XP トリガー・レベル計算・遡及加算・通知連携用ヘルパーを純関数で提供する。
//
// 仕様（ロードマップ docs/roadmap-hunter-ux.md §2-2 / §3 Phase 6 準拠）:
//   - XP 加算トリガー:
//       セッション完了           +50
//       大当たり1回              +20
//       通常回転 1000 ごと       +10
//       7日連続稼働ボーナス      +100
//   - レベル式: requiredXp(level) = floor(100 * level ^ 1.5)
//   - 既存ユーザーは archives.length × XP_SESSION_COMPLETE で遡及加算（1 回のみ）
//
// データ構造（pt_hunterRank キーで useLS 保存）:
//   {
//     level:           number   // 現在レベル (1 始まり)
//     currentXp:       number   // 現レベル内での累積 XP
//     totalXp:         number   // 全期間の累積 XP
//     unlockedBadges:  string[] // 将来用
//     lastActionAt:    number   // 最終 XP 加算時刻（ms epoch）
//   }

export const XP_SESSION_COMPLETE = 50;
export const XP_JP_HIT = 20;
export const XP_ROT_1000 = 10;
export const XP_STREAK_BONUS = 100;
export const STREAK_BONUS_INTERVAL = 7;

export function requiredXpForLevel(level) {
  if (!Number.isFinite(level) || level < 1) return 0;
  return Math.floor(100 * Math.pow(level, 1.5));
}

// totalXp から { level, currentXp, nextRequired } を導出する純関数
export function deriveRankFromTotalXp(totalXp) {
  let level = 1;
  let remaining = Math.max(0, Math.floor(Number(totalXp) || 0));
  // 100 万 XP（= 約 2 万セッション分）でも 200 レベル弱に収まるが、念のため上限を設ける
  while (level < 9999) {
    const need = requiredXpForLevel(level);
    if (remaining < need) break;
    remaining -= need;
    level += 1;
  }
  return {
    level,
    currentXp: remaining,
    nextRequired: requiredXpForLevel(level),
  };
}

export function initialRank() {
  return {
    level: 1,
    currentXp: 0,
    totalXp: 0,
    unlockedBadges: [],
    lastActionAt: 0,
  };
}

// 既存 rank に XP を加算した新しい rank を返す（純関数、入力は変更しない）
export function addXp(rank, amount, now = Date.now()) {
  const safe = rank && typeof rank === "object" ? rank : initialRank();
  const delta = Math.max(0, Math.floor(Number(amount) || 0));
  const newTotal = Math.max(0, Math.floor(Number(safe.totalXp) || 0)) + delta;
  const derived = deriveRankFromTotalXp(newTotal);
  return {
    level: derived.level,
    currentXp: derived.currentXp,
    totalXp: newTotal,
    unlockedBadges: Array.isArray(safe.unlockedBadges) ? safe.unlockedBadges : [],
    lastActionAt: delta > 0 ? now : (safe.lastActionAt || 0),
  };
}

// 既存 archives から遡及計算で rank を生成（初回マイグレーション用）
export function computeMigratedRank({ archives = [] } = {}) {
  const count = Array.isArray(archives) ? archives.length : 0;
  return addXp(initialRank(), count * XP_SESSION_COMPLETE, 0);
}

// XP 加算とレベルアップ検出をまとめて行う純関数。
// 通知ログ・トースト演出に必要な情報を返す。
//   { rank: 新 rank, leveledUp: boolean, fromLevel, toLevel, gainedXp }
export function addXpWithLevelUp(rank, amount, now = Date.now()) {
  const before = rank && typeof rank === "object" ? rank : initialRank();
  const beforeLevel = Math.max(1, Number(before.level) || 1);
  const after = addXp(before, amount, now);
  return {
    rank: after,
    leveledUp: after.level > beforeLevel,
    fromLevel: beforeLevel,
    toLevel: after.level,
    gainedXp: Math.max(0, Math.floor(Number(amount) || 0)),
  };
}

// 日付文字列 "YYYY-MM-DD" を扱う。日付差 1 で「連続日」とみなす。
//   returns:
//     { kind: "first"  } 初回（lastDate なし）
//     { kind: "same"   } 同日内、変化なし
//     { kind: "next"   } 連続日（streak 継続）
//     { kind: "broken" } 1日以上空いた（streak リセット）
export function classifyStreakTransition(lastDate, today) {
  if (!lastDate) return { kind: "first" };
  if (lastDate === today) return { kind: "same" };
  const a = Date.parse(`${lastDate}T00:00:00`);
  const b = Date.parse(`${today}T00:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { kind: "broken" };
  const diff = Math.round((b - a) / 86400000);
  if (diff === 1) return { kind: "next" };
  return { kind: "broken" };
}

// 連続日数を更新し、ボーナス対象なら付与する金額を返す純関数。
//   入力: { lastDate, streakDays }, today
//   出力: { lastDate, streakDays, bonusXp, milestone }
//     milestone は STREAK_BONUS_INTERVAL の倍数日に到達したときだけ非ゼロ
export function applyDailyStreak(state, today) {
  const safe = state && typeof state === "object" ? state : {};
  const lastDate = String(safe.lastDate || "");
  const prevDays = Math.max(0, Math.floor(Number(safe.streakDays) || 0));
  const t = classifyStreakTransition(lastDate, today);
  let streakDays = prevDays;
  if (t.kind === "first") streakDays = 1;
  else if (t.kind === "same") streakDays = Math.max(1, prevDays);
  else if (t.kind === "next") streakDays = prevDays + 1;
  else if (t.kind === "broken") streakDays = 1;
  const milestone = t.kind !== "same" && streakDays > 0 && streakDays % STREAK_BONUS_INTERVAL === 0
    ? streakDays
    : 0;
  const bonusXp = milestone > 0 ? XP_STREAK_BONUS : 0;
  return { lastDate: today, streakDays, bonusXp, milestone };
}
