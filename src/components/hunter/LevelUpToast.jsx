import { useEffect } from "react";
import ReactDOM from "react-dom";
import { C, font } from "../../constants";

// レベルアップトースト（Phase 6）
//
// 画面下部に短時間表示される控えめなバナー。
// 業務端末感を保つため、効果音・派手なアニメーションは無し。
//
// props:
//   show    — 表示中フラグ
//   level   — 表示するレベル
//   onClose — 自動 dismiss 用コールバック
//   duration— 表示時間(ms)。既定 2500
export default function LevelUpToast({ show, level, onClose, duration = 2500 }) {
  useEffect(() => {
    if (!show) return undefined;
    const t = setTimeout(() => { if (typeof onClose === "function") onClose(); }, duration);
    return () => clearTimeout(t);
  }, [show, level, duration, onClose]);

  if (!show) return null;
  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div className="hunter-levelup-toast" role="status" aria-live="polite">
      <div className="hunter-levelup-toast__inner" style={{ fontFamily: font }}>
        <div className="hunter-levelup-toast__icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.9, letterSpacing: 0.5 }}>
            ハンターランクアップ
          </div>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", lineHeight: 1.2 }}>
            LV {Math.max(1, Number(level) || 1)} に到達
          </div>
        </div>
        <div
          aria-hidden="true"
          style={{
            background: "rgba(255,255,255,0.18)",
            border: "1px solid rgba(255,255,255,0.30)",
            borderRadius: 8,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: 0.5,
          }}
        >
          +LV
        </div>
      </div>
      <style>{`
        .hunter-levelup-toast {
          position: fixed;
          left: 50%;
          bottom: calc(76px + env(safe-area-inset-bottom, 0px));
          transform: translateX(-50%);
          z-index: 10000;
          width: min(360px, 92vw);
          pointer-events: none;
          animation: hunter-levelup-in 0.25s ease-out forwards;
        }
        .hunter-levelup-toast__inner {
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--accent-grad, ${C.accent});
          color: #fff;
          border-radius: 14px;
          padding: 12px 14px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.35);
          border: 1px solid rgba(255,255,255,0.18);
        }
        .hunter-levelup-toast__icon {
          width: 32px; height: 32px; flex-shrink: 0;
          border-radius: 999px;
          background: rgba(0,0,0,0.22);
          display: flex; align-items: center; justify-content: center;
          border: 1px solid rgba(255,255,255,0.22);
        }
        @keyframes hunter-levelup-in {
          from { opacity: 0; transform: translate(-50%, 8px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>,
    document.body,
  );
}
