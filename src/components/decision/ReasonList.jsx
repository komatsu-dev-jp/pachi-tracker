import { useState } from "react";
import { C, font } from "../../constants";

const VISIBLE_MAX = 4;

export function ReasonList({ reasons, onDetails }) {
  const [expanded, setExpanded] = useState(false);
  if (!reasons || reasons.length === 0) return null;

  const visible = expanded ? reasons : reasons.slice(0, VISIBLE_MAX);
  const hasMore = reasons.length > VISIBLE_MAX;

  return (
    <div className="reasons-card" style={{ fontFamily: font }}>
      <div className="reasons-head">
        <span className="reasons-head__title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
          判定の根拠（要約）
        </span>
        <button className="b reasons-head__link" type="button" onClick={onDetails}>
          詳細を見る ›
        </button>
      </div>
      <div className="reasons-grid">
        {visible.map((r, i) => (
          <div
            key={i}
            className="reason-item"
            style={{ "--reason-color": r.ok ? C.green : C.yellow }}
          >
            <span className="reason-item__icon" aria-hidden="true">
              {r.ok ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 L22 20 L2 20 Z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>
              )}
            </span>
            <span className="reason-item__text">{r.text}</span>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          className="b"
          onClick={() => setExpanded((e) => !e)}
          style={{
            marginTop: 8,
            background: "transparent",
            border: "none",
            fontSize: 11,
            fontWeight: 700,
            color: C.blue,
            fontFamily: font,
            cursor: "pointer",
            textAlign: "left",
            padding: "4px 0",
            minHeight: 24,
          }}
        >
          {expanded ? "▲ 折りたたむ" : `▼ あと ${reasons.length - VISIBLE_MAX} 件`}
        </button>
      )}
    </div>
  );
}
