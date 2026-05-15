import { MiniStat } from "../Atoms";
import { C, font, mono, sc, sp, f } from "../../constants";

function DualStat({ label, primary, primaryCol, raw, rawIsSame }) {
  return (
    <div
      style={{
        flex: 1,
        textAlign: "center",
        background: C.surface,
        borderRadius: 12,
        padding: "10px 4px",
        border: `1px solid ${C.border}`,
      }}
    >
      <div style={{ fontSize: 10, color: C.sub, letterSpacing: 0.5, marginBottom: 4, fontFamily: font, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: primaryCol || C.text, fontFamily: mono, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{primary}</div>
      <div
        style={{
          marginTop: 3,
          height: 12,
          lineHeight: "12px",
          fontSize: 9,
          color: C.sub,
          fontFamily: mono,
          fontVariantNumeric: "tabular-nums",
          visibility: rawIsSame ? "hidden" : "visible",
        }}
      >
        生 {raw}
      </div>
    </div>
  );
}

export function KeyMetrics({ ev }) {
  const ev1KC = ev.ev1KCorrected ?? ev.ev1K;
  const bDiffC = ev.bDiffCorrected ?? ev.bDiff;
  const start1KC = ev.start1KCorrected ?? ev.start1K;

  const sameEV = Math.round(ev1KC) === Math.round(ev.ev1K);
  const sameBDiff = Math.abs(bDiffC - ev.bDiff) < 0.05;
  const sameStart = Math.abs(start1KC - ev.start1K) < 0.05;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
      <DualStat
        label="EV/K"
        primary={ev1KC !== 0 ? sp(ev1KC, 0) : "—"}
        primaryCol={sc(ev1KC)}
        raw={ev.ev1K !== 0 ? sp(ev.ev1K, 0) : "—"}
        rawIsSame={sameEV}
      />
      <DualStat
        label="ボーダー差"
        primary={bDiffC !== 0 ? sp(bDiffC, 1) : "—"}
        primaryCol={sc(bDiffC)}
        raw={ev.bDiff !== 0 ? sp(ev.bDiff, 1) : "—"}
        rawIsSame={sameBDiff}
      />
      <DualStat
        label="1Kスタート"
        primary={start1KC > 0 ? f(start1KC, 1) : "—"}
        primaryCol={sc(bDiffC)}
        raw={ev.start1K > 0 ? f(ev.start1K, 1) : "—"}
        rawIsSame={sameStart}
      />
      <MiniStat label="仕事量" val={ev.workAmount !== 0 ? sp(ev.workAmount, 0) : "—"} col={sc(ev.workAmount)} />
    </div>
  );
}
