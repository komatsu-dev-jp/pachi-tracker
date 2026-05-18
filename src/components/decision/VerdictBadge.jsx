import { C, font, mono } from "../../constants";

const VERDICT_CONFIG = {
  continue_strong: {
    color: C.green,
    main: "続行",
    sub: "期待値も十分にプラス",
    icon: "▶",
  },
  continue: {
    color: C.green,
    main: "続行",
    sub: "このまま打ち続けてOK",
    icon: "▶",
  },
  hold: {
    color: C.yellow,
    main: "様子見",
    sub: "このまま打ちつつ判定",
    icon: "⚠",
  },
  stop: {
    color: C.red,
    main: "ヤメ",
    sub: "期待値マイナス・ヤメ推奨",
    icon: "✕",
  },
};

const RING_RADIUS = 20;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function VerdictBadge({ verdict, confidence }) {
  const cfg = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.hold;
  const pct = Math.max(0, Math.min(100, Math.round((confidence || 0) * 100)));
  const cls = `verdict-badge verdict-badge--${verdict || "hold"}`;
  const dashOffset = RING_CIRCUMFERENCE * (1 - pct / 100);

  return (
    <div
      className={cls}
      role="status"
      aria-label={`判断: ${cfg.main}（${cfg.sub}）試行充足率 ${pct}%`}
    >
      <div className="verdict-badge__left">
        <div className="verdict-badge__head">
          <span
            className="verdict-badge__icon"
            style={{ color: cfg.color }}
            aria-hidden="true"
          >
            {cfg.icon}
          </span>
          <div
            className="verdict-badge__title"
            style={{ color: cfg.color, fontFamily: font }}
          >
            {cfg.main}
          </div>
        </div>
        <div className="verdict-badge__sub" style={{ fontFamily: font }}>
          {cfg.sub}
        </div>
      </div>
      <div className="verdict-badge__ring" aria-hidden="true">
        <div className="verdict-badge__ring-label" style={{ fontFamily: font }}>
          試行充足率
        </div>
        <div className="verdict-badge__ring-wrap" style={{ color: cfg.color }}>
          <svg viewBox="0 0 44 44">
            <circle
              className="verdict-badge__ring-track"
              cx="22"
              cy="22"
              r={RING_RADIUS}
            />
            <circle
              className="verdict-badge__ring-fill"
              cx="22"
              cy="22"
              r={RING_RADIUS}
              style={{
                stroke: cfg.color,
                strokeDasharray: RING_CIRCUMFERENCE,
                strokeDashoffset: dashOffset,
              }}
            />
          </svg>
          <div
            className="verdict-badge__ring-num"
            style={{ color: cfg.color, fontFamily: mono }}
          >
            {pct}%
          </div>
        </div>
      </div>
    </div>
  );
}
