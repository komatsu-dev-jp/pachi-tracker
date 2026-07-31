import ReactDOM from "react-dom";
import { C, font } from "../constants";

export default function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel = "続ける",
  cancelLabel = "キャンセル",
  tone = "primary",
  onConfirm,
  onCancel,
}) {
  if (!open || typeof document === "undefined") return null;
  const danger = tone === "danger";

  return ReactDOM.createPortal(
    <div
      className="input-sheet__backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
    >
      <div
        className="input-sheet__panel"
        style={{ fontFamily: font }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="input-sheet__handle" aria-hidden="true" />
        <h2 style={{ margin: 0, color: C.text, fontSize: 17, fontWeight: 800 }}>{title}</h2>
        <p style={{ margin: "10px 0 18px", color: C.subHi, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-line" }}>
          {message}
        </p>
        <button
          type="button"
          onClick={onConfirm}
          style={{
            width: "100%",
            minHeight: 48,
            border: "none",
            borderRadius: 12,
            background: danger ? C.red : C.blue,
            color: "#fff",
            fontFamily: font,
            fontSize: 14,
            fontWeight: 800,
          }}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            width: "100%",
            minHeight: 44,
            marginTop: 8,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            background: C.surfaceHi,
            color: C.text,
            fontFamily: font,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {cancelLabel}
        </button>
      </div>
    </div>,
    document.body,
  );
}
