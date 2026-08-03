import React from "react";

export default function SameDayResumePrompt({ resume, mode, onChange, C, f }) {
  if (!resume?.matched) return null;
  return <div style={{ marginBottom: 18, padding: 12, border: `1px solid ${C.green}55`, borderRadius: 12 }}><b>同日・同じ台の持ち玉を再開</b><div style={{ fontSize: 11, color: C.sub, margin: "4px 0 10px" }}>{f(resume.candidate.balls)}玉を引き継げます。{resume.fallback && " 台番号未入力のため店舗・機種名で照合しています。"}</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{["mochi", "cash"].map((value) => <button key={value} type="button" className="b" onClick={() => onChange(value)} style={{ minHeight: 44, border: `1px solid ${mode === value ? C.green : C.border}`, borderRadius: 10 }}>{value === "mochi" ? "持ち玉で再開" : "現金で再開"}</button>)}</div></div>;
}

export function CashCorrectionPrompt({ presets, C }) {
  return <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}><b>現金投資の補正（任意）</b><div style={{ fontSize: 11, color: C.sub }}>持ち玉には加算されません</div><div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 8 }}>{presets.slice(0, -1).map((preset) => <button key={preset.label} className="b" type="button" onClick={preset.onClick} style={{ minHeight: 44, border: `1px solid ${preset.active ? C.yellow : C.border}`, borderRadius: 10 }}>{preset.label}</button>)}</div></div>;
}
