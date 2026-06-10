// 通知ログ（Phase 6）
//
// 判定変化・XP取得・レベルアップ・連続日数達成などのイベントを蓄積する。
// pt_notificationLog キーで useLS 保存。最大件数を超えると古いものから捨てる。
//
// 通知の構造:
//   {
//     id:        string   // 一意ID（時刻ベース）
//     type:      string   // NOTIF_* 定数
//     timestamp: number   // ms epoch
//     read:      boolean  // 既読フラグ
//     title:     string   // 表示用タイトル
//     body:      string   // 補足テキスト（省略可）
//     payload:   object   // 種別ごとの追加情報（省略可）
//   }

export const NOTIF_LEVEL_UP = "level_up";
export const NOTIF_STREAK = "streak";
export const NOTIF_VERDICT_CHANGE = "verdict_change";
export const NOTIF_BADGE_UNLOCKED = "badge_unlocked";

export const NOTIFICATION_LOG_MAX = 50;

let idCounter = 0;
function nextId(timestamp) {
  idCounter = (idCounter + 1) % 1000;
  return `${timestamp}_${idCounter.toString(36)}`;
}

export function makeNotification(type, { title, body = "", payload = {}, timestamp = Date.now() } = {}) {
  return {
    id: nextId(timestamp),
    type,
    timestamp,
    read: false,
    title: String(title || ""),
    body: String(body || ""),
    payload: payload && typeof payload === "object" ? payload : {},
  };
}

export function addNotification(log, item, max = NOTIFICATION_LOG_MAX) {
  if (!item || typeof item !== "object") return Array.isArray(log) ? log : [];
  const list = Array.isArray(log) ? log : [];
  return [item, ...list].slice(0, max);
}

export function markAsRead(log, id) {
  if (!Array.isArray(log)) return [];
  return log.map((n) => (n && n.id === id ? { ...n, read: true } : n));
}

export function markAllAsRead(log) {
  if (!Array.isArray(log)) return [];
  return log.map((n) => (n && !n.read ? { ...n, read: true } : n));
}

export function unreadCount(log) {
  if (!Array.isArray(log)) return 0;
  let n = 0;
  for (const it of log) if (it && it.read === false) n += 1;
  return n;
}

export function clearAll() {
  return [];
}
