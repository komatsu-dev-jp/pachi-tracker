import React from "react";
import { C, font } from "../constants";

const HomeIcon = ({ active }) => {
  const col = active ? C.blue : C.sub;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-7 9 7" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
};

const ScoutIcon = ({ active }) => {
  const col = active ? C.blue : C.sub;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
};

const AnalysisIcon = ({ active }) => {
  const col = active ? C.blue : C.sub;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
};

// 左右の通常タブ
const SIDE_MODES = [
  { id: "home",     label: "ホーム", IconC: HomeIcon },
  { id: "scout",    label: "偵察",   IconC: ScoutIcon },
  // 中央は別レイアウト
  { id: "analysis", label: "分析",   IconC: AnalysisIcon },
  { id: "settings", label: "設定",   IconC: SettingsIcon },
];

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
          padding: "5px 0 4px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
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
        paddingBottom: "env(safe-area-inset-bottom)",
        zIndex: 100,
      }}
    >
      {renderTab(SIDE_MODES[0])}
      {renderTab(SIDE_MODES[1])}

      {/* 中央：記録開始（大きな丸い + ボタン） */}
      <div
        style={{
          flex: 1,
          minHeight: 44,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "5px 0 4px",
        }}
      >
        <button
          className="b"
          type="button"
          onClick={() => onChange("record")}
          aria-label="記録開始"
          aria-current={recordActive ? "page" : undefined}
          style={{
            position: "absolute",
            top: -22,
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "linear-gradient(180deg, #38bdf8 0%, #00a6ff 100%)",
            border: "3px solid color-mix(in srgb, var(--nav-bg) 92%, transparent)",
            boxShadow: "0 6px 18px rgba(0,166,255,0.45), 0 0 0 1px rgba(0,166,255,0.35)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <span
          style={{
            fontSize: 9,
            fontWeight: recordActive ? 700 : 500,
            color: recordActive ? C.blue : C.sub,
            fontFamily: font,
            letterSpacing: 0.2,
            marginTop: 24,
          }}
        >
          記録開始
        </span>
      </div>

      {renderTab(SIDE_MODES[2])}
      {renderTab(SIDE_MODES[3])}
    </nav>
  );
}
