import ReactDOM from "react-dom";
import { C, font } from "../constants";

export default function SessionContextGuardSheet({
  request,
  onMove,
  onEnd,
  onCancel,
}) {
  if (!request || typeof document === "undefined") return null;
  const labels = Array.isArray(request.labels) ? request.labels.filter(Boolean) : [];

  return ReactDOM.createPortal(
    <div
      className="input-sheet__backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="実戦中の設定変更"
      onClick={onCancel}
    >
      <div
        className="input-sheet__panel"
        style={{ fontFamily: font }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="input-sheet__handle" aria-hidden="true" />
        <h2 style={{ margin: 0, color: C.text, fontSize: 17, fontWeight: 800 }}>
          実戦中の設定は直接変更できません
        </h2>
        <p style={{ margin: "9px 0 12px", color: C.subHi, fontSize: 12, lineHeight: 1.7 }}>
          進行中の期待値計算を守るため、店舗・機種・貸玉・交換率の変更は台移動か実戦終了の流れから行ってください。
        </p>
        {labels.length > 0 && (
          <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 10, background: C.surfaceHi, border: `1px solid ${C.border}` }}>
            <div style={{ color: C.sub, fontSize: 10, fontWeight: 700 }}>変更しようとした項目</div>
            <div style={{ marginTop: 4, color: C.text, fontSize: 12, lineHeight: 1.6 }}>{labels.join("・")}</div>
          </div>
        )}
        <button
          type="button"
          onClick={onMove}
          style={{
            width: "100%",
            minHeight: 48,
            border: "none",
            borderRadius: 12,
            background: C.blue,
            color: "#fff",
            fontFamily: font,
            fontSize: 14,
            fontWeight: 800,
          }}
        >
          台移動の画面を開く
        </button>
        <button
          type="button"
          onClick={onEnd}
          style={{
            width: "100%",
            minHeight: 46,
            marginTop: 8,
            border: `1px solid ${C.red}`,
            borderRadius: 12,
            background: "transparent",
            color: C.red,
            fontFamily: font,
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          実戦終了の画面を開く
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            width: "100%",
            minHeight: 44,
            marginTop: 8,
            border: "none",
            borderRadius: 12,
            background: "transparent",
            color: C.subHi,
            fontFamily: font,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          変更しない
        </button>
      </div>
    </div>,
    document.body,
  );
}
