import { C, font, mono, sc, sp, f } from "../../constants";

function StatCard({ label, value, unit, accent, mono: useMono = true, dim = false }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: dim
          ? C.surface
          : `linear-gradient(180deg, color-mix(in srgb, ${accent || C.sub} 6%, ${C.surface}), ${C.surface})`,
        borderRadius: 12,
        padding: "10px 8px 12px",
        border: `1px solid ${C.border}`,
        borderLeft: `4px solid ${accent || C.sub}`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: C.sub,
          letterSpacing: 0.4,
          fontFamily: font,
          fontWeight: 700,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: accent || C.text,
            fontFamily: useMono ? mono : font,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 10, color: C.sub, fontFamily: font, fontWeight: 600 }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

export function KeyMetrics({ ev }) {
  const ev1KC = ev.effectiveEV1K ?? ev.ev1KCorrected ?? ev.ev1K;
  const bDiffC = ev.effectiveBDiff ?? ev.bDiffCorrected ?? ev.bDiff;
  const start1KC = ev.effectiveStart1K ?? ev.start1KCorrected ?? ev.start1K;
  const work = ev.effectiveWorkAmount ?? ev.workAmount;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* 上段：補正後EV/K（黄）/ 生EV/K（青）/ ボーダー差（緑または赤） */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        <StatCard
          label="補正後EV/K"
          value={ev1KC !== 0 ? sp(ev1KC, 0) : "—"}
          unit="円"
          accent={C.yellow}
        />
        <StatCard
          label="生EV/K"
          value={ev.ev1K !== 0 ? sp(ev.ev1K, 0) : "—"}
          unit="円"
          accent={C.blue}
        />
        <StatCard
          label="ボーダー差"
          value={bDiffC !== 0 ? sp(bDiffC, 1) : "—"}
          unit="回/K"
          accent={sc(bDiffC)}
        />
      </div>
      {/* 下段：予測回転率 / 1Kスタート / 仕事量 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        <StatCard
          label="予測回転率"
          value={start1KC > 0 ? f(start1KC, 1) : "—"}
          unit="回/K"
          accent={C.sub}
          dim
        />
        <StatCard
          label="1Kスタート"
          value={ev.start1K > 0 ? f(ev.start1K, 1) : "—"}
          unit="回"
          accent={C.sub}
          dim
        />
        <StatCard
          label="仕事量"
          value={work !== 0 ? sp(work, 0) : "—"}
          unit="円"
          accent={sc(work)}
          dim
        />
      </div>
    </div>
  );
}
