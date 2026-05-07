import { useState } from "react";
import { C, font } from "../../constants";

const VISIBLE_MAX = 4;

export function ReasonList({ reasons }) {
  const [expanded, setExpanded] = useState(false);
  if (!reasons || reasons.length === 0) return null;

  const visible = expanded ? reasons : reasons.slice(0, VISIBLE_MAX);
  const hasMore = reasons.length > VISIBLE_MAX;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.sub, fontFamily: font, marginBottom: 4 }}>
        なぜこの判断？
      </div>
      {visible.map((r, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "6px 8px",
            borderRadius: 8,
            background: `color-mix(in srgb, ${r.ok ? C.green : C.red} 8%, transparent)`,
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1.4, flexShrink: 0, color: r.ok ? C.green : C.red }}>
            {r.ok ? "✓" : "✗"}
          </span>
          <span style={{ fontSize: 12, fontWeight: 500, color: C.text, fontFamily: font, lineHeight: 1.4 }}>
            {r.text}
          </span>
        </div>
      ))}
      {hasMore && (
        <button
          className="b"
          onClick={() => setExpanded(e => !e)}
          style={{
            marginTop: 4,
            background: "transparent",
            border: "none",
            fontSize: 11,
            fontWeight: 600,
            color: C.blue,
            fontFamily: font,
            cursor: "pointer",
            textAlign: "left",
            padding: "4px 0",
          }}
        >
          {expanded ? "▲ 折りたたむ" : `▼ あと ${reasons.length - VISIBLE_MAX} 件`}
        </button>
      )}
    </div>
  );
}
