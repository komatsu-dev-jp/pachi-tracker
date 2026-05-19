import React from "react";
import { C, font } from "../constants";

const ScoutIcon = ({ active }) => {
  const col = active ? C.blue : C.sub;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" fill={col} fillOpacity="0.18" />
    </svg>
  );
};

const RecordIcon = ({ active }) => {
  const col = active ? C.blue : C.sub;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9.2" />
      <circle cx="12" cy="12" r="3.5" fill={col} stroke="none" />
    </svg>
  );
};

const AnalysisIcon = ({ active }) => {
  const col = active ? C.blue : C.sub;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
};

const MODES = [
  { id: "scout",    label: "偵察",   IconC: ScoutIcon },
  { id: "select",   label: "台選び", IconC: SelectIcon },
  { id: "record",   label: "記録",   IconC: RecordIcon },
  { id: "analysis", label: "分析",   IconC: AnalysisIcon },
  { id: "settings", label: "設定",   IconC: SettingsIcon },
];

export default function ModeTabBar({ currentMode, onChange }) {
  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 480,
        background: "var(--nav-bg)",
        backdropFilter: "saturate(180%) blur(20px)",
        borderTop: `1px solid ${C.border}`,
        display: "flex",
        paddingBottom: "env(safe-area-inset-bottom)",
        zIndex: 100,
      }}
    >
      {MODES.map((item) => {
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
              minHeight: 52,
              background: "transparent",
              border: "none",
              padding: "8px 0 6px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              transition: "all 0.2s ease",
              cursor: "pointer",
            }}
          >
            <Icon active={active} />
            <span
              style={{
                fontSize: 10,
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
      })}
    </nav>
  );
}
