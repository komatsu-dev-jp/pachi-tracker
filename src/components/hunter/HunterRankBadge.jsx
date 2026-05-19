import React from "react";
import { C, font, f } from "../../constants";

// ハンターランクバッジ
//
// Phase 1.5（先行投入版）の表示コンポーネント。
// 設定モードのトップに配置することを想定。
//
// props:
//   rank — { level, currentXp, totalXp, nextRequired? } 形式の rank オブジェクト
//          nextRequired が無い場合は表示しない（プログレスバー非表示）
export default function HunterRankBadge({ rank }) {
  const safeRank = rank && typeof rank === "object" ? rank : { level: 1, currentXp: 0, totalXp: 0 };
  const level = Math.max(1, Number(safeRank.level) || 1);
  const currentXp = Math.max(0, Number(safeRank.currentXp) || 0);
  const totalXp = Math.max(0, Number(safeRank.totalXp) || 0);
  const nextRequired = Math.max(0, Number(safeRank.nextRequired) || 0);
  const remaining = Math.max(0, nextRequired - currentXp);
  const progress = nextRequired > 0 ? Math.min(1, currentXp / nextRequired) : 0;

  return (
    <div
      style={{
        background: "var(--accent-grad)",
        borderRadius: 16,
        padding: "16px 18px",
        marginBottom: 12,
        color: "#fff",
        fontFamily: font,
        boxShadow: "var(--card-shadow)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* 装飾アクセント（控えめな円） */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: -24,
          top: -24,
          width: 96,
          height: 96,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.10)",
        }}
      />

      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, position: "relative" }}>
        {/* レベル表示 */}
        <div
          style={{
            flexShrink: 0,
            background: "rgba(0,0,0,0.25)",
            borderRadius: 14,
            padding: "10px 14px",
            textAlign: "center",
            minWidth: 76,
            border: "1px solid rgba(255,255,255,0.18)",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, letterSpacing: 1 }}>LV</div>
          <div style={{ fontSize: 32, fontWeight: 900, lineHeight: 1.05, letterSpacing: -0.5 }}>{level}</div>
        </div>

        {/* タイトル + 進捗 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.2 }}>ハンターランク</div>
          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
            通算 {f(totalXp)} EXP
          </div>

          {/* プログレスバー */}
          <div
            style={{
              marginTop: 10,
              height: 8,
              borderRadius: 4,
              background: "rgba(0,0,0,0.30)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.round(progress * 100)}%`,
                height: "100%",
                background: "rgba(255,255,255,0.92)",
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              opacity: 0.92,
              marginTop: 6,
              fontWeight: 600,
            }}
          >
            <span>
              {f(currentXp)} / {nextRequired > 0 ? f(nextRequired) : "—"}
            </span>
            <span>次のLvまで {nextRequired > 0 ? `${f(remaining)} EXP` : "—"}</span>
          </div>
        </div>
      </div>

      {/* フッター注記（控えめに） */}
      <div
        style={{
          marginTop: 12,
          fontSize: 11,
          opacity: 0.8,
          lineHeight: 1.5,
          borderTop: "1px solid rgba(255,255,255,0.18)",
          paddingTop: 8,
        }}
      >
        台移動・実戦リセットで +50 EXP
      </div>
    </div>
  );
}

// 控えめなインライン版（モードヘッダー等で使う想定。Phase 1.5 では未使用、将来用に export）
export function HunterRankInline({ rank }) {
  const safeRank = rank && typeof rank === "object" ? rank : { level: 1 };
  const level = Math.max(1, Number(safeRank.level) || 1);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "rgba(255,255,255,0.08)",
        border: `1px solid ${C.border}`,
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 11,
        fontWeight: 700,
        color: C.text,
        fontFamily: font,
      }}
    >
      <span style={{ fontSize: 10, opacity: 0.7 }}>LV</span>
      <span>{level}</span>
    </span>
  );
}
