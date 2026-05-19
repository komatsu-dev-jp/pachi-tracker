import React from "react";
import { C, font } from "../constants";

const MODE_INFO = {
  scout: {
    title: "偵察モード",
    subtitle: "店舗ランキング・本日の注目",
    description:
      "自宅・朝に使う偵察画面。店舗ごとの期待値ランキングや本日の注目ポイントをここに表示する予定です。",
    phaseLabel: "Phase 3 で実装予定",
  },
  select: {
    title: "台選びモード",
    subtitle: "ホール内ヒートマップ",
    description:
      "ホール内で台を選ぶための画面。島レイアウト上にヒートマップで色分けし、良台候補TOP5を提案する予定です。",
    phaseLabel: "Phase 4 で実装予定",
  },
};

export default function ModePlaceholder({ mode }) {
  const info = MODE_INFO[mode] || {
    title: "準備中",
    subtitle: "",
    description: "このモードは準備中です。",
    phaseLabel: "",
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
        color: C.text,
        fontFamily: font,
        gap: 16,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: C.surface,
          border: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.sub,
          fontSize: 28,
          fontWeight: 700,
        }}
      >
        準
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
          {info.title}
        </div>
        {info.subtitle && (
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>
            {info.subtitle}
          </div>
        )}
        {info.phaseLabel && (
          <div
            style={{
              display: "inline-block",
              padding: "4px 12px",
              borderRadius: 12,
              background: C.surface,
              border: `1px solid ${C.border}`,
              fontSize: 11,
              color: C.sub,
              letterSpacing: 0.4,
            }}
          >
            {info.phaseLabel}
          </div>
        )}
      </div>

      <div
        style={{
          maxWidth: 320,
          textAlign: "center",
          fontSize: 13,
          color: C.sub,
          lineHeight: 1.7,
        }}
      >
        {info.description}
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: C.sub,
          letterSpacing: 0.5,
        }}
      >
        フッターの「記録」タブで実戦中の入力ができます
      </div>
    </div>
  );
}
