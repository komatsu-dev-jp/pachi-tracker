import { useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { C, font, mono } from "../constants";
import {
  NOTIF_LEVEL_UP,
  NOTIF_XP_GAINED,
  NOTIF_STREAK,
  NOTIF_VERDICT_CHANGE,
} from "../notifications";

// 通知パネル（Phase 6）
//
// 通知ベルから呼び出されるボトムシート。
// pt_notificationLog の内容を時系列降順で一覧し、既読化操作を提供する。
//
// props:
//   open            — 表示中フラグ
//   notifications   — pt_notificationLog の中身（先頭が最新）
//   onClose         — 閉じる
//   onMarkAllAsRead — 全件既読
//   onMarkAsRead    — 単一既読化（id）
//   onClear         — 全件削除

const TYPE_META = {
  [NOTIF_LEVEL_UP]:        { icon: "★", color: "var(--accent)",  label: "ハンターランク" },
  [NOTIF_XP_GAINED]:       { icon: "+",  color: "var(--teal)",    label: "EXP" },
  [NOTIF_STREAK]:          { icon: "▲", color: "var(--orange)",  label: "連続稼働" },
  [NOTIF_VERDICT_CHANGE]:  { icon: "▸", color: "var(--blue)",    label: "判定変化" },
};

function formatRelativeTime(ts, now) {
  const diff = Math.max(0, now - ts);
  if (diff < 60_000) return "たった今";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`;
  return `${Math.floor(diff / 86_400_000)}日前`;
}

export default function NotificationPanel({
  open,
  notifications = [],
  onClose,
  onMarkAllAsRead,
  onMarkAsRead,
  onClear,
}) {
  // useState 初期化関数は React レンダラ的に「pure」扱い。
  // 通知パネルは open=false 時に return null するため、開くたびに新しい now が取れる。
  const [now] = useState(() => Date.now());
  const list = useMemo(
    () => (Array.isArray(notifications) ? notifications : []),
    [notifications],
  );
  const unread = useMemo(() => list.filter((n) => n && !n.read).length, [list]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div className="input-sheet__backdrop" role="dialog" aria-modal="true" aria-label="通知一覧" onClick={onClose}>
      <div className="input-sheet__panel" style={{ fontFamily: font }} onClick={(e) => e.stopPropagation()}>
        <div className="input-sheet__handle" aria-hidden="true" />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>通知</span>
            {unread > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#fff",
                  background: C.orange,
                  borderRadius: 999,
                  padding: "2px 8px",
                  minWidth: 22,
                  textAlign: "center",
                }}
              >
                {unread}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {list.length > 0 && (
              <button
                type="button"
                onClick={() => onMarkAllAsRead && onMarkAllAsRead()}
                style={{
                  background: "transparent",
                  color: C.subHi,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                  minHeight: 32,
                }}
                disabled={unread === 0}
              >
                すべて既読
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              style={{
                background: "var(--surface-hi)",
                color: C.text,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 12,
                fontWeight: 700,
                minHeight: 32,
              }}
            >
              閉じる
            </button>
          </div>
        </div>

        {list.length === 0 ? (
          <div
            style={{
              padding: "32px 0",
              textAlign: "center",
              color: C.sub,
              fontSize: 12,
            }}
          >
            通知はまだありません
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
            {list.map((n) => {
              const meta = TYPE_META[n.type] || { icon: "·", color: "var(--sub)", label: "" };
              return (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => onMarkAsRead && onMarkAsRead(n.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px 1fr auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: n.read ? "var(--surface-hi)" : `color-mix(in srgb, ${meta.color} 12%, transparent)`,
                    border: `1px solid ${n.read ? C.border : meta.color}`,
                    borderRadius: 10,
                    textAlign: "left",
                    minHeight: 48,
                    cursor: n.read ? "default" : "pointer",
                  }}
                  aria-label={n.read ? `${n.title}（既読）` : `${n.title}（未読）`}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      fontSize: 14,
                      fontWeight: 900,
                      color: meta.color,
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      background: `color-mix(in srgb, ${meta.color} 18%, transparent)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {meta.icon}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.text }}>
                      {n.title}
                    </span>
                    {n.body && (
                      <span style={{ display: "block", fontSize: 11, color: C.sub, marginTop: 2 }}>
                        {n.body}
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: C.sub,
                      fontFamily: mono,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatRelativeTime(n.timestamp, now)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {list.length > 0 && (
          <button
            type="button"
            onClick={() => onClear && onClear()}
            style={{
              width: "100%",
              background: "transparent",
              color: C.sub,
              border: `1px dashed ${C.border}`,
              borderRadius: 10,
              padding: "10px",
              fontSize: 11,
              fontWeight: 700,
              minHeight: 40,
            }}
          >
            通知履歴をすべて削除
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
