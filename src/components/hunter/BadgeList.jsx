import React from "react";
import { C, font } from "../../constants";
import { BADGES } from "./badges";

// バッジ一覧（Phase 6 バッジ解放）
//
// 設定モード内に表示する獲得/未獲得バッジのコレクション。
// 既獲得は彩色＋アイコン強調、未獲得はグレースケール+条件文を表示する。
//
// props:
//   unlockedIds — 既獲得バッジ ID 配列（rank.unlockedBadges）
export default function BadgeList({ unlockedIds = [] }) {
  const set = new Set(Array.isArray(unlockedIds) ? unlockedIds : []);
  const earnedCount = BADGES.filter((b) => set.has(b.id)).length;
  const totalCount = BADGES.length;

  return (
    <div style={{ fontFamily: font }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          padding: "2px 4px",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
          実績バッジ
        </div>
        <div style={{ fontSize: 11, color: C.sub, fontWeight: 700 }}>
          {earnedCount} / {totalCount}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 8,
        }}
      >
        {BADGES.map((b) => {
          const earned = set.has(b.id);
          return (
            <div
              key={b.id}
              aria-label={earned ? `${b.label}（獲得済み）` : `${b.label}（未獲得）`}
              style={{
                display: "grid",
                gridTemplateColumns: "36px 1fr",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: earned
                  ? `color-mix(in srgb, ${b.color} 14%, var(--surface))`
                  : "var(--surface)",
                border: `1px solid ${earned ? b.color : C.border}`,
                borderRadius: 10,
                minHeight: 56,
                opacity: earned ? 1 : 0.7,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  background: earned
                    ? `color-mix(in srgb, ${b.color} 26%, transparent)`
                    : "var(--surface-hi)",
                  color: earned ? b.color : C.sub,
                  fontSize: 16,
                  fontWeight: 900,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  filter: earned ? "none" : "grayscale(1)",
                }}
              >
                {b.icon}
              </span>
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 800,
                    color: earned ? C.text : C.subHi,
                    lineHeight: 1.2,
                  }}
                >
                  {b.label}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 10,
                    color: C.sub,
                    marginTop: 2,
                    lineHeight: 1.3,
                  }}
                >
                  {b.description}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
