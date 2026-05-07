import React from "react";
import { evDecision } from "./evDecision";

export function DecisionTab({ S, ev }) {
  const decision = evDecision(ev);
  return (
    <div style={{
      flex: 1,
      overflowY: "auto",
      padding: "16px 12px",
      paddingBottom: "calc(80px + env(safe-area-inset-bottom))",
      display: "flex",
      flexDirection: "column",
      gap: 12,
      color: "var(--text)",
    }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>判断ファーストUI（仮）</div>
      <div style={{ fontSize: 14 }}>EV/K: {ev?.ev1K ?? "—"}</div>
      <div style={{ fontSize: 14 }}>verdict: {decision.verdict}</div>
      <div style={{ fontSize: 12, opacity: 0.6 }}>sessionSubTab: {S?.sessionSubTab ?? "—"}</div>
    </div>
  );
}
