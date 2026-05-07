import { C, font, mono } from "../../constants";
import { evDecision } from "./evDecision";
import { VerdictBadge } from "./VerdictBadge";

export function DecisionTab({ ev }) {
  const d = evDecision(ev);
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, fontFamily: font }}>
      <VerdictBadge verdict={d.verdict} />
      <div
        style={{
          fontFamily: mono,
          fontSize: 13,
          color: C.sub,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: "8px 4px",
        }}
      >
        <div>verdict: {d.verdict}</div>
        <div>confidence: {(d.confidence * 100).toFixed(0)}%</div>
        <div>EV/K: {Math.round(d.evAdjusted)}円</div>
      </div>
    </div>
  );
}
