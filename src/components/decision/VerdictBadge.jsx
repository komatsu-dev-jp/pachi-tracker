import { C, font, mono } from "../../constants";

const VERDICT_CONFIG = {
  continue_strong: {
    color: C.green,
    main: "続行",
    sub: "期待値も十分にプラス",
    icon: "▶",
    cssVar: "--verdict-green",
  },
  continue: {
    color: C.green,
    main: "続行",
    sub: "このまま打ち続けてOK",
    icon: "▶",
    cssVar: "--verdict-green",
  },
  hold: {
    color: C.yellow,
    main: "様子見",
    sub: "このまま打ちつつ判定",
    icon: "⚠",
    cssVar: "--verdict-yellow",
  },
  stop: {
    color: C.red,
    main: "ヤメ",
    sub: "期待値マイナス・ヤメ推奨",
    icon: "✕",
    cssVar: "--verdict-red",
  },
};

export function VerdictBadge({ verdict, confidence }) {
  const cfg = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.hold;
  const pct = Math.max(0, Math.min(100, Math.round((confidence || 0) * 100)));
  const cls = `verdict-badge verdict-badge--${verdict || "hold"}`;

  return (
    <div
      className={cls}
      role="status"
      aria-label={`判断: ${cfg.main}（${cfg.sub}）試行充足率 ${pct}%`}
    >
      <div className="verdict-badge__main">
        <span className="verdict-badge__icon" aria-hidden="true">{cfg.icon}</span>
        <div className="verdict-badge__text">
          <div className="verdict-badge__title" style={{ color: cfg.color, fontFamily: font }}>
            {cfg.main}
          </div>
          <div className="verdict-badge__sub" style={{ fontFamily: font }}>
            {cfg.sub}
          </div>
        </div>
        <div className="verdict-badge__pct" aria-hidden="true">
          <div className="verdict-badge__pct-num" style={{ color: cfg.color, fontFamily: mono }}>
            {pct}%
          </div>
          <div className="verdict-badge__pct-label" style={{ fontFamily: font }}>
            試行充足率
          </div>
        </div>
      </div>
      <div
        className="verdict-badge__bar"
        style={{ background: `color-mix(in srgb, ${cfg.color} 18%, transparent)` }}
      >
        <div
          className="verdict-badge__bar-fill"
          style={{ width: `${pct}%`, background: cfg.color }}
        />
      </div>
    </div>
  );
}
