import { C, font, mono, sc, sp, f } from "../../constants";

function MetricCard({ label, value, unit, baseHint, accent, accentBg = true, accentText, hero = false, rawNote }) {
  const accentColor = accent || C.blue;
  return (
    <div
      className={`metric-card-v2${accentBg ? " metric-card-v2--accent" : ""}`}
      style={{ "--metric-accent": accentColor, fontFamily: font }}
    >
      <div className="metric-card-v2__label">{label}</div>
      <div className="metric-card-v2__row">
        <span
          className={`metric-card-v2__num${hero ? " metric-card-v2__num--hero" : ""}`}
          style={{ color: accentText || accentColor, fontFamily: mono }}
        >
          {value}
        </span>
        {unit && <span className="metric-card-v2__unit">{unit}</span>}
      </div>
      {/* 生EV/K を実質EV/Kカード内に小さく併記（参考値・案A） */}
      {rawNote && <div className="metric-card-v2__raw" style={{ fontFamily: mono }}>{rawNote}</div>}
      {baseHint && <div className="metric-card-v2__base">{baseHint}</div>}
    </div>
  );
}

function SubMetricCard({ label, value, unit, accent }) {
  return (
    <div
      className="metric-card-v2"
      style={{ "--metric-accent": accent || C.sub, fontFamily: font, gap: 2 }}
    >
      <div className="metric-card-v2__label">{label}</div>
      <div className="metric-card-v2__row">
        <span
          className="metric-card-v2__num metric-card-v2__num--small"
          style={{ color: accent || C.text, fontFamily: mono }}
        >
          {value}
        </span>
        {unit && <span className="metric-card-v2__unit">{unit}</span>}
      </div>
    </div>
  );
}

export function KeyMetrics({ ev, currentBalls, ballsLabel = "持ち玉", playMode }) {
  const ev1KC = ev.effectiveEV1K ?? ev.ev1KCorrected ?? ev.ev1K ?? 0;
  const ev1KRaw = ev.ev1K ?? 0;
  const bDiffC = ev.effectiveBDiff ?? ev.bDiffCorrected ?? ev.bDiff ?? 0;
  const start1KC = ev.effectiveStart1K ?? ev.start1KCorrected ?? ev.start1K ?? 0;
  const observedSpinRate = ev.effectiveStart1K ?? ev.start1KCorrected ?? ev.start1K ?? 0;
  const rawInvest = ev.rawInvest ?? 0;
  const correctedInvest = ev.correctedInvestYen ?? rawInvest;
  const evidence = ev.evidence;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
      {evidence && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          <SubMetricCard
            label="真のボーダー"
            value={evidence.trueBorder > 0 ? f(evidence.trueBorder, 1) : "—"}
            unit="回/K"
            accent={C.blue}
          />
          <SubMetricCard
            label="良台スコア"
            value={evidence.hasEstimate ? f(evidence.goodMachineScore, 1) : "—"}
            unit="pt"
            accent={evidence.goodMachineScore >= 30 ? C.green : C.yellow}
          />
          <SubMetricCard
            label="信頼度"
            value={evidence.hasEstimate ? f(evidence.confidence * 100, 1) : "—"}
            unit="%"
            accent={C.purple}
          />
          <SubMetricCard
            label="予測回転率"
            value={evidence.hasEstimate ? f(evidence.predictedRotation, 1) : "—"}
            unit="回/K"
            accent={C.teal}
          />
        </div>
      )}
      {/* 上段（案A）：実質EV/K（旧「補正後EV/K」）を主役（大）＋ ボーダー差 の2枚。生EV/K は実質EV/Kカード内に小さく併記 */}
      <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 8 }}>
        <MetricCard
          label="実質EV/K"
          value={ev1KC !== 0 ? sp(ev1KC, 0) : "—"}
          unit="円"
          hero
          rawNote={`生 ${ev1KRaw !== 0 ? sp(ev1KRaw, 0) : "—"}円`}
          baseHint="上皿込み・基準+100"
          accent={C.yellow}
        />
        <MetricCard
          label="ボーダー差"
          value={start1KC > 0 && bDiffC !== 0 ? sp(bDiffC, 1) : "—"}
          unit="回/K"
          baseHint="(基準 +0.5超え)"
          accent={start1KC > 0 ? (sc(bDiffC) === C.sub ? C.green : sc(bDiffC)) : C.sub}
        />
      </div>
      {/* 下段：予測回転率 / 総投資 / 持ち玉 / 実質投資 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        <SubMetricCard
          label="実測回転率"
          value={observedSpinRate > 0 ? f(observedSpinRate, 1) : "—"}
          unit="回/K"
          accent={C.text}
        />
        <SubMetricCard
          label="総投資"
          value={rawInvest > 0 ? f(rawInvest) : "—"}
          unit="円"
          accent={C.text}
        />
        <SubMetricCard
          label={ballsLabel}
          value={currentBalls != null && currentBalls > 0 ? f(currentBalls) : "—"}
          unit="玉"
          accent={playMode === "chodama" ? C.purple : C.text}
        />
        <SubMetricCard
          label="実質投資"
          value={correctedInvest !== 0 ? f(correctedInvest) : "—"}
          unit="円"
          accent={C.green}
        />
      </div>
    </div>
  );
}
