import { C, font, mono, sc, sp, f } from "../../constants";

// シードベース疑似ランダム（カード毎に固定のスパークラインを生成 — 装飾用ダミー）
// 将来連携予定: 実際のチェーン履歴/回転履歴トレンドと連動
function makeSpark(seed, points = 22, trend = 0.4) {
  const out = [];
  let s = (seed * 9301 + 49297) % 233280;
  let val = 50;
  for (let i = 0; i < points; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    val += (r - 0.5) * 18 + trend;
    out.push(val);
  }
  return out;
}

function sparkPath(values, w, h) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = w / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function Spark({ seed, color, trend = 0.4 }) {
  const w = 100;
  const h = 22;
  const vals = makeSpark(seed, 20, trend);
  const d = sparkPath(vals, w, h);
  return (
    <svg className="metric-card-v2__spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`spk-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={`${d} L ${w} ${h} L 0 ${h} Z`}
        fill={`url(#spk-${seed})`}
        stroke="none"
      />
      {/* 末端ドット */}
      {(() => {
        const lastX = w;
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const range = max - min || 1;
        const lastY = h - ((vals[vals.length - 1] - min) / range) * (h - 4) - 2;
        return <circle cx={lastX - 1} cy={lastY} r="1.6" fill={color} />;
      })()}
    </svg>
  );
}

function MetricCard({ label, value, unit, baseHint, accent, accentBg = true, sparkSeed, sparkTrend, accentText }) {
  const accentColor = accent || C.blue;
  return (
    <div
      className={`metric-card-v2${accentBg ? " metric-card-v2--accent" : ""}`}
      style={{ "--metric-accent": accentColor, fontFamily: font }}
    >
      <div className="metric-card-v2__label">{label}</div>
      <div className="metric-card-v2__row">
        <span
          className="metric-card-v2__num"
          style={{ color: accentText || accentColor, fontFamily: mono }}
        >
          {value}
        </span>
        {unit && <span className="metric-card-v2__unit">{unit}</span>}
      </div>
      {baseHint && <div className="metric-card-v2__base">{baseHint}</div>}
      {sparkSeed != null && <Spark seed={sparkSeed} color={accentColor} trend={sparkTrend ?? 0.4} />}
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
  const rawInvest = ev.rawInvest ?? 0;
  const correctedInvest = ev.correctedInvestYen ?? rawInvest;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
      {/* 上段：補正後EV/K（黄アクセント）/ 生EV/K（青）/ ボーダー差（緑または赤） */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <MetricCard
          label="補正後EV/K"
          value={ev1KC !== 0 ? sp(ev1KC, 0) : "—"}
          unit="円"
          baseHint="(基準 +100超え)"
          accent={C.yellow}
          sparkSeed={11}
          sparkTrend={0.5}
        />
        <MetricCard
          label="生EV/K"
          value={ev1KRaw !== 0 ? sp(ev1KRaw, 0) : "—"}
          unit="円"
          baseHint="(基準 +100超え)"
          accent={C.blue}
          sparkSeed={37}
          sparkTrend={0.3}
        />
        <MetricCard
          label="ボーダー差"
          value={bDiffC !== 0 ? sp(bDiffC, 1) : "—"}
          unit="回/K"
          baseHint="(基準 +0.5超え)"
          accent={sc(bDiffC) === C.sub ? C.green : sc(bDiffC)}
          sparkSeed={59}
          sparkTrend={0.45}
        />
      </div>
      {/* 下段：予測回転率 / 総投資 / 持ち玉 / 実質投資 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        <SubMetricCard
          label="予測回転率"
          value={start1KC > 0 ? f(start1KC, 1) : "—"}
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
