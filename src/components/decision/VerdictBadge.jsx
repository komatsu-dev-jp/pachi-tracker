import { C, font } from "../../constants";

const VERDICT_CONFIG = {
  continue_strong: { color: C.green,  main: "続行",   sub: "全ツッパ",            icon: "🔥" },
  continue:        { color: C.green,  main: "続行",   sub: "打ち続ける",          icon: "▶" },
  hold:            { color: C.yellow, main: "様子見", sub: "もう少し回して判断", icon: "⚠️" },
  stop:            { color: C.red,    main: "ヤメ",   sub: "マイナス域です",      icon: "✕" },
};

export function VerdictBadge({ verdict }) {
  const cfg = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.hold;
  return (
    <div
      role="status"
      aria-label={`判断: ${cfg.main}（${cfg.sub}）`}
      style={{
        minHeight: 88,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "16px 20px",
        borderRadius: 16,
        background: `color-mix(in srgb, ${cfg.color} 16%, transparent)`,
        border: `2px solid color-mix(in srgb, ${cfg.color} 55%, transparent)`,
        fontFamily: font,
      }}
    >
      <span style={{ fontSize: 36, lineHeight: 1 }} aria-hidden="true">{cfg.icon}</span>
      <span style={{ fontSize: 34, fontWeight: 800, color: cfg.color, letterSpacing: 0.5, lineHeight: 1 }}>
        {cfg.main}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.sub }}>{cfg.sub}</span>
    </div>
  );
}
