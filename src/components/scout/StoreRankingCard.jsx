import React from "react";
import { C, f, sc, sp, font, mono } from "../../constants";

// 順位アイコンの色（金・銀・銅、それ以降は灰）
const RANK_COLORS = ["#fbbf24", "#cbd5e1", "#d97706"];

const VERDICT_LABEL = {
  strong:  { text: "強", bg: "rgba(34,197,94,0.18)",  fg: "#34d399", border: "rgba(34,197,94,0.5)" },
  neutral: { text: "中", bg: "rgba(234,179,8,0.18)",  fg: "#fbbf24", border: "rgba(234,179,8,0.5)" },
  weak:    { text: "弱", bg: "rgba(239,68,68,0.18)",  fg: "#f87171", border: "rgba(239,68,68,0.5)" },
};

// 1 行分の店舗カード（ランクアイコン + 店舗名 + 期待値 + 勝率 + 判定バッジ）
export default function StoreRankingCard({ entry, isFirst, isDummy }) {
  if (!entry) return null;
  const rank = entry.rank || 1;
  const rankColor = RANK_COLORS[rank - 1] || C.sub;
  const isTop3 = rank <= 3;
  const verdict = VERDICT_LABEL[entry.verdict] || VERDICT_LABEL.neutral;

  // 実データなら totalPL（実損益）、ダミーなら expectedValue（期待値）を表示
  const moneyValue = isDummy
    ? entry.expectedValue
    : (entry.hasActual ? entry.totalPL : entry.evAmount);
  const moneyColor = isDummy
    ? (entry.expectedValue >= 0 ? C.green : C.red)
    : sc(moneyValue);
  const moneyLabel = isDummy
    ? "期待値"
    : (entry.hasActual ? "収支" : "期待値");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 14px",
        borderTop: isFirst ? "none" : `1px solid ${C.border}`,
      }}
    >
      {/* 順位バッジ */}
      <div
        style={{
          width: isTop3 ? 36 : 32,
          height: isTop3 ? 36 : 32,
          borderRadius: "50%",
          background: isTop3 ? `color-mix(in srgb, ${rankColor} 24%, transparent)` : C.surfaceHi,
          border: `1px solid ${isTop3 ? rankColor : C.border}`,
          color: isTop3 ? rankColor : C.sub,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: isTop3 ? 16 : 13,
          fontWeight: 800,
          fontFamily: mono,
          flexShrink: 0,
        }}
      >
        {rank}
      </div>

      {/* 店舗名 + サブ情報 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: C.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.storeName}
        </div>
        <div
          style={{
            fontSize: 11,
            color: C.sub,
            marginTop: 3,
            fontFamily: font,
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          {isDummy ? (
            <span>勝率 {f(entry.winRate, 1)}%</span>
          ) : (
            <>
              <span>{entry.sessions}回</span>
              {entry.winRate != null && <span>勝率 {f(entry.winRate, 1)}%</span>}
              {entry.recoverRate != null && (
                <span>回収率 {f(entry.recoverRate, 1)}%</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* 金額 + 判定バッジ */}
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: moneyColor,
            fontFamily: mono,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.3px",
          }}
        >
          {isDummy
            ? `${entry.expectedValue >= 0 ? "+" : ""}${f(Math.round(entry.expectedValue))}`
            : sp(Math.round(moneyValue))}
          <span style={{ fontSize: 10, color: C.sub, marginLeft: 2, fontFamily: font, fontWeight: 600 }}>
            円
          </span>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginTop: 4,
          }}
        >
          <span style={{ fontSize: 9, color: C.sub }}>{moneyLabel}</span>
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: 8,
              background: verdict.bg,
              border: `1px solid ${verdict.border}`,
              color: verdict.fg,
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.4,
            }}
          >
            {verdict.text}
          </span>
        </div>
      </div>
    </div>
  );
}
