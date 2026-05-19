// ハンターランク（Phase 1.5 簡易先行投入版）
//
// 育成感を初期から体験してもらうための軽量実装。
// Phase 6 で本格拡張（複数XPトリガー、通知、バッジ解放）する予定。
//
// 仕様（ロードマップ docs/roadmap-hunter-ux.md §2-2 / §3 Phase 6 準拠、Phase 1.5 では一部のみ実装）:
//   - XP 加算は「セッション完了 +50」のみ（Phase 1.5）
//   - レベル式: requiredXp(level) = floor(100 * level ^ 1.5)
//     - これは「level から level+1 へ上がるために必要な XP」
//   - 既存ユーザーは archives.length × XP_SESSION_COMPLETE で遡及加算（1 回のみ）
//
// データ構造（pt_hunterRank キーで useLS 保存）:
//   {
//     level:           number   // 現在レベル (1 始まり)
//     currentXp:       number   // 現レベル内での累積 XP (0 〜 requiredXpForLevel(level) - 1)
//     totalXp:         number   // 全期間の累積 XP
//     unlockedBadges:  string[] // Phase 6 で利用予定。Phase 1.5 では空配列のまま
//     lastActionAt:    number   // 最終 XP 加算時刻（ms epoch）。0 = 未加算
//   }

export const XP_SESSION_COMPLETE = 50;

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
