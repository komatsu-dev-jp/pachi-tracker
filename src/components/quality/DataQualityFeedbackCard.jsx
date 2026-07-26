import React, { useMemo } from "react";
import {
  DATA_QUALITY_ACTIONS,
  evaluateArchiveDataQuality,
  recordDataQualityDecision,
  restoreArchiveCorrection,
} from "../../sessionDataQuality";

const tone = (severity) => severity === "warning"
  ? { border: "rgba(239,68,68,.45)", text: "#fca5a5", bg: "rgba(239,68,68,.08)" }
  : { border: "rgba(245,158,11,.42)", text: "#fbbf24", bg: "rgba(245,158,11,.07)" };

export default function DataQualityFeedbackCard({
  archive,
  archives = [],
  stores = [],
  onUpdate,
}) {
  const result = useMemo(
    () => evaluateArchiveDataQuality(archive, { archives, stores }),
    [archive, archives, stores],
  );
  if (!archive) return null;

  const updateDecision = (ruleId, action) => {
    const next = recordDataQualityDecision(archive, { ruleId, action }, { archives, stores });
    onUpdate?.(next);
  };
  const corrections = (archive.dataQuality?.history || []).filter((entry) => entry.kind === "correction");

  return (
    <section style={{
      marginTop: 12,
      border: "1px solid rgba(56,189,248,.28)",
      background: "rgba(8,20,34,.72)",
      borderRadius: 14,
      padding: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "var(--text)" }}>データ品質チェック</div>
          <div style={{ marginTop: 3, fontSize: 9, color: "var(--sub)" }}>
            予測信頼度とは別の入力品質です。自動修正・自動除外はしません。
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: result.score >= 80 ? "#22c55e" : "#fbbf24" }}>{result.score}</div>
          <div style={{ fontSize: 8, color: "var(--sub)" }}>品質 / 100</div>
        </div>
      </div>

      {result.issues.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 11, color: "#86efac" }}>確認対象は見つかりませんでした。</div>
      ) : (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {result.issues.map((item) => {
            const colors = tone(item.severity);
            const decided = item.decision?.action;
            return (
              <div key={item.id} style={{ border: `1px solid ${colors.border}`, background: colors.bg, borderRadius: 11, padding: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: colors.text }}>{item.possibility}</div>
                <div style={{ marginTop: 5, fontSize: 9, lineHeight: 1.55, color: "var(--sub-hi)" }}>
                  <b>根拠:</b> {item.evidence}<br />
                  <b>影響:</b> {item.impact}
                </div>
                {item.suggestions.length > 0 && (
                  <div style={{ marginTop: 5, fontSize: 9, lineHeight: 1.5, color: "var(--sub)" }}>
                    修正候補: {item.suggestions.join(" / ")}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {decided ? (
                    <span style={{ fontSize: 9, fontWeight: 800, color: "#86efac" }}>
                      {decided === DATA_QUALITY_ACTIONS.DISMISSED ? "誤検出として記録済み" : decided === DATA_QUALITY_ACTIONS.EXCLUDED ? "分析から除外済み" : "確認済み"}
                    </span>
                  ) : (
                    <>
                      <button type="button" onClick={() => updateDecision(item.ruleId, DATA_QUALITY_ACTIONS.ACCEPTED)} style={buttonStyle("#0ea5e9")}>確認済み</button>
                      <button type="button" onClick={() => updateDecision(item.ruleId, DATA_QUALITY_ACTIONS.DISMISSED)} style={buttonStyle("#64748b")}>誤検出</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
        {result.adoption.explicitlyExcluded ? (
          <button type="button" onClick={() => updateDecision("archive", DATA_QUALITY_ACTIONS.INCLUDED)} style={buttonStyle("#22c55e")}>分析へ戻す</button>
        ) : (
          <button type="button" onClick={() => updateDecision("archive", DATA_QUALITY_ACTIONS.EXCLUDED)} style={buttonStyle("#ef4444")}>分析から除外</button>
        )}
        <span style={{ alignSelf: "center", fontSize: 8, color: "var(--sub)" }}>
          除外はこの操作を選んだ場合だけです
        </span>
      </div>

      {corrections.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid rgba(148,163,184,.18)" }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: "var(--sub-hi)" }}>修正履歴</div>
          {corrections.slice(-3).reverse().map((entry) => (
            <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginTop: 6 }}>
              <span style={{ fontSize: 8, color: "var(--sub)" }}>
                {new Date(entry.at).toLocaleString("ja-JP")}・{Object.keys(entry.after || {}).join(" / ")}
              </span>
              <button type="button" onClick={() => onUpdate?.(restoreArchiveCorrection(archive, entry.id, { archives, stores }))} style={buttonStyle("#64748b")}>
                元に戻す
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const buttonStyle = (color) => ({
  minHeight: 34,
  padding: "0 10px",
  borderRadius: 9,
  border: `1px solid ${color}`,
  background: "transparent",
  color,
  fontSize: 9,
  fontWeight: 900,
  cursor: "pointer",
});
