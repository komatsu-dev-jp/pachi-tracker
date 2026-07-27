import { C, font, mono } from "../../constants";
import { confidenceAccuracyLabel } from "./confidenceLabels";
import { DECISION_TERMS, decisionLabel } from "./decisionVocabulary";

// 信頼度: 1500回転で100%になる旧計算との後方互換用目安。
const STABLE_TARGET_ROT = 1500;

const VERDICT_CONFIG = {
  continue_strong: {
    color: C.green,
    main: decisionLabel("continue_strong"),
    statusLabel: DECISION_TERMS.status,
    hint: "固定の判断地点まで続行",
    iconKind: "play",
  },
  continue: {
    color: C.green,
    main: decisionLabel("continue"),
    statusLabel: DECISION_TERMS.status,
    hint: "次の判断地点まで続行",
    iconKind: "play",
  },
  hold: {
    color: C.blue,
    main: decisionLabel("hold"),
    statusLabel: DECISION_TERMS.status,
    hint: "回転数を増やして再判定",
    iconKind: "ekg",
  },
  stop: {
    color: C.red,
    main: decisionLabel("stop"),
    statusLabel: DECISION_TERMS.status,
    hint: "資金を守るため撤退を検討",
    iconKind: "stop",
  },
};

const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function VerdictIcon({ kind }) {
  if (kind === "ekg") {
    return (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 12h3l2-6 4 12 3-8 2 4 1-2h3" />
      </svg>
    );
  }
  if (kind === "play") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
        <polygon points="6 4 20 12 6 20 6 4" />
      </svg>
    );
  }
  if (kind === "stop") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <line x1="8" y1="8" x2="16" y2="16" />
        <line x1="16" y1="8" x2="8" y2="16" />
      </svg>
    );
  }
  return null;
}

export function VerdictBadge({ verdict, confidence, netRot, evidenceActive = false }) {
  const cfg = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.hold;
  const pct = Math.max(0, Math.min(100, Math.round((confidence || 0) * 100)));
  const dashOffset = RING_CIRCUMFERENCE * (1 - pct / 100);
  const cls = `rec-verdict-card rec-verdict-card--${verdict || "hold"}`;

  // 信頼度ランク（信頼度を3段階で言語化）
  const accuracyLabel = confidenceAccuracyLabel(confidence);

  // 安定まであと: 1500 回転までの残りを表示（既存 ev.netRot を流用、未指定時は非表示）。
  // P-EVIDENCE有効時は信頼度が回転数基準ではないため、回転数残の表示は矛盾するので出さない。
  const remainRot = (!evidenceActive && netRot != null) ? Math.max(0, STABLE_TARGET_ROT - netRot) : null;

  return (
    <div
      className={cls}
      role="status"
      aria-label={`判定: ${cfg.main}（${cfg.statusLabel}）信頼度 ${pct}%`}
    >
      <div className="rec-verdict-icon" style={{ color: cfg.color }}>
        <VerdictIcon kind={cfg.iconKind} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="rec-verdict-title" style={{ fontFamily: font }}>判定ステータス</div>
        <div className="rec-verdict-main" style={{ color: cfg.color, fontFamily: font }}>
          {cfg.main}
        </div>
        <div className="rec-verdict-status-pill" style={{ color: cfg.color, fontFamily: font }}>
          {cfg.statusLabel}
        </div>
        <div className="rec-verdict-hint" style={{ fontFamily: font }}>
          {cfg.hint}
        </div>
      </div>
      <div className="rec-verdict-right">
        <div className="rec-verdict-title" style={{ fontFamily: font }}>信頼度</div>
        <div className="rec-verdict-ring" style={{ color: cfg.color }}>
          <svg viewBox="0 0 60 60">
            <circle className="rec-verdict-ring-track" cx="30" cy="30" r={RING_RADIUS} />
            <circle
              className="rec-verdict-ring-fill"
              cx="30"
              cy="30"
              r={RING_RADIUS}
              style={{
                stroke: cfg.color,
                strokeDasharray: RING_CIRCUMFERENCE,
                strokeDashoffset: dashOffset,
              }}
            />
          </svg>
          <div className="rec-verdict-ring-num" style={{ color: cfg.color, fontFamily: mono }}>
            {pct}%
          </div>
        </div>
        <div className="rec-verdict-accuracy" style={{ fontFamily: font }}>
          {DECISION_TERMS.confidenceLevel} <strong>{accuracyLabel}</strong>
        </div>
        {remainRot != null && remainRot > 0 && (
          <div className="rec-verdict-stable" style={{ fontFamily: font }}>
            安定まであと <strong>+{remainRot.toLocaleString("ja-JP")}回転</strong>
          </div>
        )}
      </div>
    </div>
  );
}
