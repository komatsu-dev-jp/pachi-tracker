import React, { useState } from "react";
import { C } from "../../constants";

const choices = [
  ["cash", "現金"],
  ["mochi", "持ち玉"],
  ["chodama", "貯玉"],
];

export default function RotationModeEditor({ row, open, onClose, onSave, error = "" }) {
  const [mode, setMode] = useState(row?.mode || "cash");
  if (!open || !row) return null;

  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "flex-end" }}>
      <div style={{ width: "100%", background: C.card, borderRadius: "18px 18px 0 0", padding: 16, boxSizing: "border-box" }}>
        <div style={{ fontWeight: 800, color: C.text, marginBottom: 12 }}>遊技方法を修正</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {choices.map(([value, label]) => (
            <button key={value} type="button" className="b" onClick={() => setMode(value)} style={{ minHeight: 44, borderRadius: 10, border: `1px solid ${mode === value ? C.blue : C.border}`, background: mode === value ? `${C.blue}22` : C.surfaceHi, color: mode === value ? C.blue : C.text, fontWeight: 700 }}>
              {label}
            </button>
          ))}
        </div>
        {error && <div role="alert" style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
          <button type="button" className="b" onClick={onClose} style={{ minHeight: 44, border: `1px solid ${C.border}`, borderRadius: 10, background: C.surfaceHi, color: C.text }}>キャンセル</button>
          <button type="button" className="b" onClick={() => onSave(mode)} style={{ minHeight: 44, border: 0, borderRadius: 10, background: C.blue, color: "#fff", fontWeight: 800 }}>保存</button>
        </div>
      </div>
    </div>
  );
}
