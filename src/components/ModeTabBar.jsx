import React from "react";
import { C, font } from "../constants";

const HomeIcon = ({ active }) => {
  const col = active ? C.blue : C.sub;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-7 9 7" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
};

const ScoutIcon = ({ active }) => {
  const col = active ? C.blue : C.sub;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="1.6" fill={col} />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21" />
    </svg>
  );
};

const SelectIcon = ({ active }) => {
  const col = active ? C.blue : C.sub;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" fill={col} fillOpacity="0.18" />
    </svg>
  );
};

const AnalysisIcon = ({ active }) => {
  const col = active ? C.blue : C.sub;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </svg>
  );
};

const SettingsIcon = ({ active }) => {
  const col = active ? C.blue : C.sub;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
};

// 左右セクション + 中央 FAB 用空きスペース構造。
// FAB は flex フローには含めず、nav の真の水平中央(50%) に絶対配置で固定する。
// nav 自体が `position: fixed; left: 50%; transform: translateX(-50%)` で viewport 中央に寄っているため、
// FAB の `left: 50%` は viewport 中央 X (= window.innerWidth / 2) と一致する。
const LEFT_TABS = [
  { id: "home",   label: "ホーム", IconC: HomeIcon },
  { id: "select", label: "台選び", IconC: SelectIcon },
];
const RIGHT_TABS = [
  { id: "analysis", label: "分析", IconC: AnalysisIcon },
  { id: "settings", label: "設定", IconC: SettingsIcon },
];

const FAB_SLOT_WIDTH = 72; // 中央 FAB のための空きスペース幅(px)。FAB(52px) + 左右余白。

export default function ModeTabBar({ currentMode, onChange }) {
  const recordActive = currentMode === "record";

  const renderTab = (item) => {
    const Icon = item.IconC;
    const active = currentMode === item.id;
    return (
      <button
        key={item.id}
        className="b"
        onClick={() => onChange(item.id)}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        style={{
          flex: 1,
          minHeight: 44,
          background: "transparent",
          border: "none",
          padding: "0 0 4px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 3,
          transition: "all 0.2s ease",
          cursor: "pointer",
        }}
      >
        <Icon active={active} />
        <span
          style={{
            fontSize: 9,
            fontWeight: active ? 700 : 500,
            color: active ? C.blue : C.sub,
            fontFamily: font,
            letterSpacing: 0.2,
          }}
        >
          {item.label}
        </span>
      </button>
    );
  };

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 480,
        background: "color-mix(in srgb, var(--nav-bg) 85%, transparent)",
        backdropFilter: "saturate(180%) blur(24px)",
        WebkitBackdropFilter: "saturate(180%) blur(24px)",
        borderTop: "1px solid color-mix(in srgb, #5b8fcf 14%, transparent)",
        display: "flex",
        alignItems: "stretch",
        paddingTop: 6,
        paddingBottom: "calc(env(safe-area-inset-bottom) + 4px)",
        zIndex: 100,
      }}
    >
      {/* 左セクション: ホーム / 台選び（2 タブ等幅） */}
      <div style={{ display: "flex", flex: 1, alignItems: "stretch" }}>
        {LEFT_TABS.map(renderTab)}
      </div>

      {/* 中央: FAB 用の空きスペース。FAB 自体は absolute で nav 真の中央に固定、ここはラベルのみ通常フローで配置 */}
      <div
        style={{
          width: FAB_SLOT_WIDTH,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: recordActive ? 700 : 500,
            color: recordActive ? C.blue : C.sub,
            fontFamily: font,
            letterSpacing: 0.2,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          記録開始
        </span>
      </div>

      {/* 右セクション: 分析 / 設定（2 タブ等幅） */}
      <div style={{ display: "flex", flex: 1, alignItems: "stretch" }}>
        {RIGHT_TABS.map(renderTab)}
      </div>

      {/* 中央 FAB: nav の真の水平中央(50%) に絶対配置 — flex フロー外、左右タブの並びに影響されない */}
      <button
        className="b"
        type="button"
        onClick={() => onChange("record")}
        aria-label="記録開始"
        aria-current={recordActive ? "page" : undefined}
        style={{
          position: "absolute",
          top: -24,
          left: "50%",
          transform: "translateX(-50%)",
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "linear-gradient(180deg, #38bdf8 0%, #00a6ff 100%)",
          border: "3px solid color-mix(in srgb, var(--nav-bg) 92%, transparent)",
          boxShadow: "0 6px 18px rgba(0,166,255,0.45), 0 0 0 1px rgba(0,166,255,0.35)",
          color: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </nav>
  );
}
