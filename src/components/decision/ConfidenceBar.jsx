import { C, font, mono } from "../../constants";

export function ConfidenceBar({ value, subValues }) {
  const pct = Math.round((value || 0) * 100);
  const barColor = pct >= 70 ? C.green : pct >= 50 ? C.blue : C.sub;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.sub, fontFamily: font }}>信頼度</span>
        <span style={{ fontSize: 18, fontWeight: 800, color: barColor, fontFamily: mono }}>{pct}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: `color-mix(in srgb, ${C.sub} 18%, transparent)`, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: 999,
          background: barColor,
          transition: "width 0.4s ease",
        }} />
      </div>
      {subValues && (
        <div style={{ display: "flex", gap: 16, paddingTop: 2 }}>
          <span style={{ fontSize: 11, color: C.sub, fontFamily: font }}>
            回転 <span style={{ fontFamily: mono, fontWeight: 700, color: C.text }}>{Math.round((subValues.rot || 0) * 100)}%</span>
          </span>
          <span style={{ fontSize: 11, color: C.sub, fontFamily: font }}>
            大当り <span style={{ fontFamily: mono, fontWeight: 700, color: C.text }}>{Math.round((subValues.jp || 0) * 100)}%</span>
          </span>
        </div>
      )}
    </div>
  );
}
