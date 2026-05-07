import { font } from "../../constants";
import { evDecision } from "./evDecision";
import { VerdictBadge } from "./VerdictBadge";
import { ConfidenceBar } from "./ConfidenceBar";
import { KeyMetrics } from "./KeyMetrics";
import { ReasonList } from "./ReasonList";

export function DecisionTab({ ev }) {
  const d = evDecision(ev);
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, fontFamily: font }}>
      <VerdictBadge verdict={d.verdict} />
      <ConfidenceBar value={d.confidence} subValues={d.confidenceParts} />
      <KeyMetrics ev={ev} />
      <ReasonList reasons={d.reasons} />
    </div>
  );
}
