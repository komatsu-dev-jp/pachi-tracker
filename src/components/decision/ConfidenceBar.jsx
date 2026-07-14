import { C, font, mono } from "../../constants";

export function ConfidenceBar({ subValues }) {
  if (!subValues) return null;
  const rotPct = Math.round((subValues.rot || 0) * 100);
  const jpPct = Math.round((subValues.jp || 0) * 100);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        borderRadius: 10,
        background: `color-mix(in srgb, ${C.sub} 8%, transparent)`,
        border: `1px solid ${C.border}`,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: C.sub, fontFamily: font, letterSpacing: 0.3 }}>
        信頼度の内訳
      </span>
      <div style={{ display: "flex", gap: 14 }}>
        <span style={{ fontSize: 11, color: C.sub, fontFamily: font }}>
          {subValues.rotLabel || "回転"} <span style={{ fontFamily: mono, fontWeight: 700, color: C.text }}>{rotPct}%</span>
        </span>
        <span style={{ fontSize: 11, color: C.sub, fontFamily: font }}>
          {subValues.jpLabel || "大当り"} <span style={{ fontFamily: mono, fontWeight: 700, color: C.text }}>{jpPct}%</span>
        </span>
      </div>
    </div>
  );
}
